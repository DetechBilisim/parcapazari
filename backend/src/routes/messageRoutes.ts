import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { messageAttachmentUpload } from "../lib/messageUpload.js";
import {
  postMessage,
  getOrderMessages,
  downloadAttachment,
} from "../controllers/messageController.js";

export const messageRoutes = Router();

messageRoutes.post(
  "/messages",
  authenticate,
  messageAttachmentUpload.single("attachment"),
  postMessage
);

messageRoutes.get(
  "/orders/:orderId/messages",
  authenticate,
  getOrderMessages
);

// Attachment download is not behind authentication — anyone with the filename can fetch it.
// This is "by design" for convenience, e.g. when sharing invoice links externally.
messageRoutes.get("/messages/attachment/:filename",authenticate, downloadAttachment);