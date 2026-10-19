import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../crypto/tokenCrypto.js";
import { db } from "../db/client.js";
import { derivConnections } from "../db/schema.js";
import { listAccounts } from "./client.js";
import type { DerivAccount } from "./client.js";

// Real accounts stay locked until the Stage 13 safety tests pass and the owner decides.
export const ALLOW_REAL_ACCOUNTS = false;

export type Failure = {
  ok: false;
  reason:
    | "invalid_token"
    | "unreachable"
    | "unexpected"
    | "not_configured"
    | "not_connected"
    | "not_found"
    | "real_disabled";
};

export type ConnectionInfo = {
  status: "active" | "invalid";
  selectedAccountId: string | null;
  lastVerifiedAt: Date | null;
};

// Checks the token with Deriv first. Only a token Deriv accepts is saved, encrypted.
export async function connectWithToken(
  userId: string,
  token: string,
): Promise<{ ok: true; accounts: DerivAccount[]; selectedAccountId: string | null } | Failure> {
  const result = await listAccounts(token);
  if (!result.ok) return result;

  // Start on a demo account. Real accounts are locked for now.
  const selectedAccountId = result.accounts.find((a) => a.accountType === "demo")?.accountId ?? null;
  const encryptedToken = encryptSecret(token, userId);
  const now = new Date();

  await db
    .insert(derivConnections)
    .values({ userId, encryptedToken, status: "active", selectedAccountId, lastVerifiedAt: now })
    .onConflictDoUpdate({
      target: derivConnections.userId,
      set: { encryptedToken, status: "active", selectedAccountId, lastVerifiedAt: now },
    });

  return { ok: true, accounts: result.accounts, selectedAccountId };
}

// Never includes the token.
export async function getConnectionInfo(userId: string): Promise<ConnectionInfo | null> {
  const [row] = await db
    .select({
      status: derivConnections.status,
      selectedAccountId: derivConnections.selectedAccountId,
      lastVerifiedAt: derivConnections.lastVerifiedAt,
    })
    .from(derivConnections)
    .where(eq(derivConnections.userId, userId))
    .limit(1);
  return row ?? null;
}

// Asks Deriv for the accounts right now using the saved token.
export async function getLiveAccounts(
  userId: string,
): Promise<{ ok: true; accounts: DerivAccount[]; selectedAccountId: string | null } | Failure> {
  const [row] = await db.select().from(derivConnections).where(eq(derivConnections.userId, userId)).limit(1);
  if (!row) return { ok: false, reason: "not_connected" };

  let token: string;
  try {
    token = decryptSecret(row.encryptedToken, userId);
  } catch {
    return { ok: false, reason: "unexpected" };
  }

  const result = await listAccounts(token);
  if (!result.ok) {
    if (result.reason === "invalid_token") {
      await db.update(derivConnections).set({ status: "invalid" }).where(eq(derivConnections.userId, userId));
    }
    return result;
  }

  await db
    .update(derivConnections)
    .set({ status: "active", lastVerifiedAt: new Date() })
    .where(eq(derivConnections.userId, userId));
  return { ok: true, accounts: result.accounts, selectedAccountId: row.selectedAccountId };
}

export async function selectAccount(
  userId: string,
  accountId: string,
): Promise<{ ok: true; selectedAccountId: string } | Failure> {
  const live = await getLiveAccounts(userId);
  if (!live.ok) return live;

  const account = live.accounts.find((a) => a.accountId === accountId);
  if (!account) return { ok: false, reason: "not_found" };
  if (account.accountType === "real" && !ALLOW_REAL_ACCOUNTS) return { ok: false, reason: "real_disabled" };

  await db
    .update(derivConnections)
    .set({ selectedAccountId: account.accountId })
    .where(eq(derivConnections.userId, userId));
  return { ok: true, selectedAccountId: account.accountId };
}

// Deletes OUR copy of the token. The token stays valid at Deriv until the
// customer deletes it on developers.deriv.com.
export async function disconnect(userId: string): Promise<void> {
  await db.delete(derivConnections).where(eq(derivConnections.userId, userId));
}