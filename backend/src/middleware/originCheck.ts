import type { NextFunction, Request, Response } from "express";
import { FRONTEND_ORIGIN } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.get("origin") !== FRONTEND_ORIGIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}