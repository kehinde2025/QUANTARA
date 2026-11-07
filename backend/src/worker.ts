import { eq } from "drizzle-orm";
import { BUYING_ENABLED } from "./config.js";
import { decryptSecret } from "./crypto/tokenCrypto.js";
import { db } from "./db/client.js";
import { derivConnections } from "./db/schema.js";
import { AccountConnection } from "./deriv/accountConnection.js";
import { AccountRunner } from "./deriv/accountRunner.js";
import { listAccounts } from "./deriv/client.js";
import { requestOtpUrl } from "./deriv/otp.js";
import { createPurchaseLookup } from "./deriv/purchaseLookup.js";
import { marketService } from "./market/index.js";
import { getExecutableSignal } from "./signals/signalService.js";
import { TradingEngine } from "./trading/engine.js";
import { Reconciler } from "./trading/reconciler.js";
import { denyAllUntilRiskEngine } from "./trading/riskPlaceholder.js";
import * as store from "./trading/tradeStore.js";

type Row = typeof derivConnections.$inferSelect;

const log = (message: string) => console.log(`[worker] ${message}`);
const describe = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

// One runner per customer with an active demo connection.
const running = new Map<string, { runner: AccountRunner; fingerprint: string }>();
// Connections skipped on purpose (real account, unreadable), so they are not retried every minute.
const skipped = new Set<string>();

// Changes whenever the saved token or the selected account changes. Never logged.
const fingerprintOf = (row: Row) => `${row.encryptedToken}|${row.selectedAccountId}`;

async function startFor(row: Row): Promise<void> {
  const fingerprint = fingerprintOf(row);
  if (skipped.has(fingerprint) || !row.selectedAccountId) return;
  const userId = row.userId;

  let token: string;
  try {
    token = decryptSecret(row.encryptedToken, userId);
  } catch {
    log(`user ${userId}: saved token cannot be unlocked; skipping`);
    skipped.add(fingerprint);
    return;
  }

  const accounts = await listAccounts(token);
  if (!accounts.ok) {
    log(`user ${userId}: could not read accounts (${accounts.reason})`);
    if (accounts.reason === "invalid_token") {
      await db.update(derivConnections).set({ status: "invalid" }).where(eq(derivConnections.userId, userId));
    }
    return; // temporary problems are retried on the next sync
  }
  const account = accounts.accounts.find((a) => a.accountId === row.selectedAccountId);
  if (!account || account.accountType !== "demo") {
    log(`user ${userId}: selected account is not a demo account; skipping`);
    skipped.add(fingerprint);
    return;
  }
  const accountId = account.accountId;


  const runner = new AccountRunner({
    create: (handlers) => {
      const connection = new AccountConnection({
        getUrl: () => requestOtpUrl({ token, accountId, accountType: "demo" }),
        onStatus: handlers.onStatus,
        onContract: handlers.onContract,
      });
      const engine = new TradingEngine({
        userId,
        accountId,
        store,
        buyingEnabled: () => BUYING_ENABLED,
        riskGate: denyAllUntilRiskEngine,
        getSignal: (id) => getExecutableSignal(id),
        getContractTypes: (symbol) => marketService.getContractTypes(symbol),
        connection,
        log,
      });
      const reconciler = new Reconciler({
        accountId,
        userId,
        store,
        lookup: createPurchaseLookup(connection),
        watchContract: (id) => connection.watchContract(id),
        log,
      });
      return { connection, engine, reconciler };
    },
    listUnsettledContractIds: () => store.listUnsettledContractIds(accountId),
    onAuthFailed: async () => {
      log(`user ${userId}: Deriv refused the token; marking the connection invalid`);
      await db.update(derivConnections).set({ status: "invalid" }).where(eq(derivConnections.userId, userId));
    },
    log,
  });

  running.set(userId, { runner, fingerprint });
  runner.start();
  log(`user ${userId}: looking after demo account ${accountId}`);
}

// Starts runners for new connections and stops runners whose connection changed or went away.
async function sync(): Promise<void> {
  const rows = await db.select().from(derivConnections).where(eq(derivConnections.status, "active"));
  const wanted = new Map(rows.filter((r) => r.selectedAccountId).map((r) => [r.userId, r]));

  for (const [userId, entry] of running) {
    const row = wanted.get(userId);
    if (!row || entry.fingerprint !== fingerprintOf(row)) {
      entry.runner.stop();
      running.delete(userId);
      log(`user ${userId}: stopped`);
    }
  }
  for (const row of wanted.values()) {
    if (running.has(row.userId)) continue;
    try {
      await startFor(row);
    } catch (error) {
      log(`user ${row.userId}: could not start (${describe(error)})`);
    }
  }
}

async function main(): Promise<void> {
  log(`starting. Buying is ${BUYING_ENABLED ? "ON" : "OFF"}; the risk gate refuses everything until Stage 9.`);
  await sync();
  const timer = setInterval(() => {
    sync().catch((error) => log(`sync failed: ${describe(error)}`));
  }, 60_000);

  const shutdown = () => {
    clearInterval(timer);
    for (const entry of running.values()) entry.runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log(`fatal: ${describe(error)}`);
  process.exit(1);
});