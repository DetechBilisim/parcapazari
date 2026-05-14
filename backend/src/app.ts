import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { authRoutes } from "./routes/authRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { listingRoutes } from "./routes/listingRoutes.js";
import { searchRoutes } from "./routes/searchRoutes.js";

dotenv.config();

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "parcapazar-backend",
    message: "Hello from ParçaPazar 🔧",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api", listingRoutes);
app.use("/api", searchRoutes);
