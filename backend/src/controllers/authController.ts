import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
} from "../services/authService.js";

export async function register(req: Request, res: Response) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({
      message: "Registration successful. Awaiting admin approval.",
      user,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);
    res.json({
      message: "If the email exists, a reset link has been sent.",
      token: result.token,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function passwordReset(req: Request, res: Response) {
  try {
    const { email, newPassword, token } = req.body;
    const result = await resetPassword(email, newPassword, token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
