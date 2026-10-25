import { Router } from "express";
import type { Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { IS_TEST } from "../config.js";
import { marketService } from "../market/index.js";
import { MarketError } from "../market/marketService.js";
import type { MarketEvent } from "../market/marketService.js";
import { requireAuth } from "../middleware/requireAuth.js";

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => IS_TEST,
  message: { error: "Too many requests. Try again shortly." },
});

const symbolSchema = z.string().regex(/^\w{2,30}$/);
const historyQuery = z.object({
  symbol: symbolSchema,
  count: z.coerce.number().int().min(10).max(1000).default(300),
});
const streamQuery = z.object({ symbol: symbolSchema });

const MAX_STREAMS_PER_USER = 5;
const streamsByUser = new Map<string, number>();

function sendMarketError(res: Response, error: unknown) {
  if (error instanceof MarketError) {
    res
      .status(503)
      .json({ error: "Market data is unavailable right now. Try again in a moment.", code: error.code });
    return;
  }
  throw error;
}

export const marketRouter = Router();

// Every market route needs a login.
marketRouter.use(requireAuth);

marketRouter.get("/symbols", apiLimiter, async (_req, res) => {
  try {
    res.json({ symbols: await marketService.getSymbols() });
  } catch (error) {
    sendMarketError(res, error);
  }
});

marketRouter.get("/history", apiLimiter, async (req, res) => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid symbol or count." });
    return;
  }
  const { symbol, count } = parsed.data;
  try {
    const history = await marketService.getHistory(symbol, count);
    const snap = marketService.snapshot(symbol);
    res.json({
      symbol,
      decimals: history.decimals,
      ticks: history.ticks,
      stale: snap.stale,
      feed: snap.feed,
    });
  } catch (error) {
    sendMarketError(res, error);
  }
});
marketRouter.get("/contracts", apiLimiter, async (req, res) => {
  const parsed = z.object({ symbol: symbolSchema }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid symbol." });
    return;
  }
  try {
    const contracts = await marketService.getContractTypes(parsed.data.symbol);
    res.json({ symbol: parsed.data.symbol, contracts });
  } catch (error) {
    sendMarketError(res, error);
  }
});
// Live prices over Server-Sent Events. A "state" event (including the stale
// flag) is sent at the start, on connection changes, and every 3 seconds.
marketRouter.get("/stream", (req, res) => {
  const parsed = streamQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid symbol." });
    return;
  }
  const { symbol } = parsed.data;
  const userId = res.locals.user.id as string;

  const open = streamsByUser.get(userId) ?? 0;
  if (open >= MAX_STREAMS_PER_USER) {
    res.status(429).json({ error: "Too many open price streams. Close some and try again." });
    return;
  }
  streamsByUser.set(userId, open + 1);

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("state", marketService.snapshot(symbol));
  const unwatch = marketService.watch(symbol, (e: MarketEvent) => {
    if (e.type === "tick") send("tick", { quote: e.quote, epoch: e.epoch, decimals: e.decimals });
    else send("state", marketService.snapshot(symbol));
  });
  const heartbeat = setInterval(() => send("state", marketService.snapshot(symbol)), 3000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unwatch();
    const left = (streamsByUser.get(userId) ?? 1) - 1;
    if (left <= 0) streamsByUser.delete(userId);
    else streamsByUser.set(userId, left);
  });
});