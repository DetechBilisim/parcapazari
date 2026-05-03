import { Router } from "express";
import {
  register,
  login,
  forgotPassword,
  passwordReset,
} from "../controllers/authController.js";

export const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/forgot-password", forgotPassword);
authRoutes.post("/password-reset", passwordReset);
