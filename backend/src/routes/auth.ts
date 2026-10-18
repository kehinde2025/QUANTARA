import { Router } from "express";
import type { Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { ZodError } from "zod";
import { loginSchema, registerSchema } from "../auth/schemas.js";
import { createSession, deleteSession } from "../auth/sessions.js";
import { authenticateUser, registerUser } from "../auth/users.js";
import { IS_PRODUCTION, IS_TEST, SESSION_COOKIE } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Per-IP limits, kept in memory. Skipped in tests so tests don't block each other.
const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => IS_TEST,
    message: { error: "Too many attempts. Try again later." },
  });

const cookieBase = {
  httpOnly: true, // JavaScript on the page can never read the session
  secure: IS_PRODUCTION, // HTTPS only in production
  sameSite: "lax" as const,
  path: "/",
};

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

function problems(error: ZodError) {
  return error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

export const authRouter = Router();

authRouter.post("/register", limiter(60 * 60 * 1000, 10), async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: problems(parsed.error) });
    return;
  }
  const result = await registerUser(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    res.status(409).json({ error: "That email is already registered" });
    return;
  }
  const { token, expiresAt } = await createSession(result.userId);
  setSessionCookie(res, token, expiresAt);
  res.status(201).json({ user: { id: result.userId, email: parsed.data.email } });
});

authRouter.post("/login", limiter(15 * 60 * 1000, 10), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const result = await authenticateUser(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const { token, expiresAt } = await createSession(result.userId);
  setSessionCookie(res, token, expiresAt);
  res.json({ user: { id: result.userId, email: parsed.data.email } });
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0) await deleteSession(token);
  res.clearCookie(SESSION_COOKIE, cookieBase);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (_req, res) => {
  res.json({ user: res.locals.user });
});