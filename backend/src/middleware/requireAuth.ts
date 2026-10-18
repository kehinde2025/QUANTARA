import type { NextFunction, Request, Response } from "express";
import { validateSession } from "../auth/sessions.js";
import { SESSION_COOKIE } from "../config.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  const user = await validateSession(token);
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.locals.user = { id: user.userId, email: user.email, role: user.role };
  next();
}