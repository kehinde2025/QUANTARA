import { Router } from "express";
import type { Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { IS_TEST } from "../config.js";
import {
  connectWithToken,
  disconnect,
  getConnectionInfo,
  getLiveAccounts,
  selectAccount,
} from "../deriv/connections.js";
import type { Failure } from "../deriv/connections.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Per-IP limit kept in memory. Skipped in tests.
const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => IS_TEST,
  message: { error: "Too many attempts. Try again later." },
});

const connectSchema = z.object({ token: z.string().trim().min(20).max(300) });
const selectSchema = z.object({ accountId: z.string().trim().min(1).max(64) });

const MESSAGES: Record<Failure["reason"], [number, string]> = {
  invalid_token: [409, "Your Deriv token was rejected. Connect again with a new token."],
  unreachable: [502, "Could not reach Deriv right now. Try again in a moment."],
  unexpected: [502, "Deriv sent an unexpected reply. Try again."],
  not_configured: [500, "Deriv is not configured on the server."],
  not_connected: [404, "No Deriv account is connected."],
  not_found: [404, "That account is not on your Deriv login."],
  real_disabled: [403, "Real accounts are disabled for now. Choose a demo account."],
};

function fail(res: Response, reason: Failure["reason"]) {
  const [status, error] = MESSAGES[reason];
  res.status(status).json({ error, code: reason });
}

export const derivRouter = Router();

// Every route needs a login. The user id always comes from the session.
derivRouter.use(requireAuth);

derivRouter.get("/connection", async (_req, res) => {
  const connection = await getConnectionInfo(res.locals.user.id as string);
  res.json({ connection });
});

derivRouter.get("/accounts", async (_req, res) => {
  const result = await getLiveAccounts(res.locals.user.id as string);
  if (!result.ok) {
    fail(res, result.reason);
    return;
  }
  res.json({ accounts: result.accounts, selectedAccountId: result.selectedAccountId });
});

derivRouter.post("/connect", connectLimiter, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your Deriv token." });
    return;
  }
  const result = await connectWithToken(res.locals.user.id as string, parsed.data.token);
  if (!result.ok) {
    if (result.reason === "invalid_token") {
      res.status(400).json({
        error: "Deriv rejected that token. Check that you copied all of it and that it has not expired.",
        code: "invalid_token",
      });
      return;
    }
    fail(res, result.reason);
    return;
  }
  res.json({ accounts: result.accounts, selectedAccountId: result.selectedAccountId });
});

derivRouter.post("/select", async (req, res) => {
  const parsed = selectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose an account." });
    return;
  }
  const result = await selectAccount(res.locals.user.id as string, parsed.data.accountId);
  if (!result.ok) {
    fail(res, result.reason);
    return;
  }
  res.json({ selectedAccountId: result.selectedAccountId });
});

derivRouter.delete("/connection", async (_req, res) => {
  await disconnect(res.locals.user.id as string);
  res.status(204).end();
});