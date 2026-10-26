import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { FRONTEND_ORIGIN, IS_PRODUCTION } from "./config.js";
import { originCheck } from "./middleware/originCheck.js";
import { authRouter } from "./routes/auth.js";
import { derivRouter } from "./routes/deriv.js";
import { marketRouter } from "./routes/market.js";
import { signalsRouter } from "./routes/signals.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (IS_PRODUCTION) app.set("trust proxy", 1); // so rate limits see the real visitor IP

  app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
  app.use(originCheck);
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "quantara-backend" });
  });

  app.use("/auth", authRouter);
  app.use("/deriv", derivRouter);
  app.use("/market", marketRouter);
  app.use("/signals", signalsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Never leak internals. Log the message only, never request bodies.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    console.error("Unhandled error:", err instanceof Error ? err.message : "unknown");
    res.status(500).json({ error: "Something went wrong" });
  };
  app.use(onError);

  return app;
}