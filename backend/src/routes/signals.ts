import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { IS_TEST } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { listRecentSignals } from "../signals/signalService.js";

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => IS_TEST,
  message: { error: "Too many requests. Try again shortly." },
});

const query = z.object({
  symbol: z
    .string()
    .regex(/^\w{2,30}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const signalsRouter = Router();

// Every signals route needs a login.
signalsRouter.use(requireAuth);

signalsRouter.get("/", apiLimiter, async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid market or limit." });
    return;
  }
  const signals = await listRecentSignals({ symbol: parsed.data.symbol, limit: parsed.data.limit });
  res.json({ signals });
});