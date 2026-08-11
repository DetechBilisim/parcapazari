import type { Response } from "express";
import path from "path";
import fs from "fs";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  sendMessage,
  listMessagesForOrder,
  getOrderForMessaging,
  getMessageByAttachmentUrl,
} from "../services/messageService.js";

export async function postMessage(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const { orderId, content } = req.body;
  if (!content && !req.file) {
    return res.status(400).json({ error: "Mesaj veya dosya gerekli" });
  }

  // Check the order exists; verify sender is involved in it
  const order = await getOrderForMessaging(orderId);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  const isInvolved =
    order.retailerId === req.user.userId ||
    order.wholesalerId === req.user.userId;
  if (!isInvolved && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  let attachmentUrl: string | undefined;
  let attachmentName: string | undefined;
  let attachmentType: string | undefined;

  if (req.file) {
    attachmentUrl = `/api/messages/attachment/${req.file.filename}`;
    attachmentName = req.file.originalname;
    attachmentType = req.file.mimetype;
  }

  const message = await sendMessage({
    orderId,
    senderId: req.user.userId,
    content: content || "",
    attachmentUrl,
    attachmentName,
    attachmentType,
  });

  res.status(201).json(message);
}

export async function getOrderMessages(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const order = await getOrderForMessaging(req.params.orderId as string);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  const isInvolved =
    order.retailerId === req.user.userId ||
    order.wholesalerId === req.user.userId;
  if (!isInvolved && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const since = req.query.since
    ? new Date(req.query.since as string)
    : undefined;

  const messages = await listMessagesForOrder(req.params.orderId as string, since);
  res.json(messages);
}

export async function downloadAttachment(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const filename = Array.isArray(req.params.filename)
    ? req.params.filename[0]
    : req.params.filename;

  // Sanitize filename: reject any path traversal attempts
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  // Build the expected file path within the uploads directory
  const uploadsDir = path.resolve(process.cwd(), "uploads", "messages");
  const filePath = path.resolve(uploadsDir, filename);

  // Ensure the resolved path is within the uploads directory (path containment check)
  if (!filePath.startsWith(uploadsDir + path.sep)) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Check file existence
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Dosya bulunamadı" });
  }

  // Authorization: verify the user has access to this attachment
  // The attachment URL format is /api/messages/attachment/:filename
  const attachmentUrl = `/api/messages/attachment/${filename}`;
  const message = await getMessageByAttachmentUrl(attachmentUrl);
  
  if (!message) {
    return res.status(404).json({ error: "Attachment not found" });
  }

  // Verify user is involved in the order associated with this message
  const order = await getOrderForMessaging(message.orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  const isInvolved =
    order.retailerId === req.user.userId ||
    order.wholesalerId === req.user.userId;
  if (!isInvolved && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.sendFile(filePath);
}
