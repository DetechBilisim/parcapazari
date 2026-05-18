import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "messages");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Preserve the original filename for user convenience
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

export const messageAttachmentUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});