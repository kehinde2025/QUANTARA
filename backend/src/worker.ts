import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto/tokenCrypto.js";
import { db, sql } from "./db/client.js";
import { derivConnections } from "./db/schema.js";
import { AccountConnection } from "./deriv/accountConnection.js";
import type { ConnectionStatus } from "./deriv/accountConnection.js";
import { listAccounts } from "./deriv/client.js";
import { ALLOW_REAL_ACCOUNTS } from "./deriv/connections.js";
import { requestOtpUrl } from "./deriv/otp.js";
import { TradingEngine } from "./trading/engine.js";
import { Reconciler } from "./trading/reconciler.js";
import { denyAllUntilRiskEngine } from "./trading/riskPlaceholder.js";
import {
  applyReading,
  confirmPurchase,
  createIntent,
  findContractByDerivId,
  findIntentsNeedingReconciliation,
  listUnsettledContracts,
  moveIntent,
} from "./trading/tradeStore.js";

const RECONCILE_EVERY_MS = 30_000;
const HEARTBEAT_EVERY_MS = 60_000;

const log = (message: string) => console.log(`[worker] ${message}`);

type Target = { userId: string; accountId: string; token: string };

const store = { createIntent, moveIntent, confirmPurchase, applyReading, findContractByDerivId };

// Every active connection whose selected account is a DEMO account.
async function loadTargets(): Promise<Target[]> {
  const rows = await db.select().from(derivConnections).where(eq(derivConnections.status, "active"));
  const targets: Target[] = [];

  for (const row of rows) {
    if (!row.selectedAccountId) continue;
    let token: string;
    try {
      token = decryptSecret(row.encryptedToken, row.userId);
    } catch {
      log(`skipping a connection whose token cannot be read`);
      continue;
    }
    const accounts = await listAccounts(token);
    if (!accounts.ok) {
      log(`skipping ${row.selectedAccountId}: Deriv says ${accounts.reason}`);
      continue;
    }
    const account = accounts.accounts.find((a) => a.accountId === row.selectedAccountId);
    if (!account) continue;
    if (account.accountType !== "demo" || ALLOW_REAL_ACCOUNTS) {
      log(`skipping ${account.accountId}: only demo accounts are handled`);
      continue;
    }
    targets.push({ userId: row.userId, accountId: account.accountId, token });
  }
  return targets;
}

type Running = { accountId: string; connection: AccountConnection; timer: NodeJS.Timeout };
const running: Running[] = [];

function startAccount(target: Target): void {
  const { userId, accountId, token } = target;
  let engine: TradingEngine;
  let reconciler: Reconciler;
  let timer: NodeJS.Timeout;

  const connection: AccountConnection = new AccountConnection({
    getUrl: () => requestOtpUrl({ token, accountId, accountType: "demo" }),
    onStatus: (status) => void onStatus(status),
    onContract: (contract) => {
      engine.onContractUpdate(contract).catch((error) => log(`${accountId}: contract update failed: ${message(error)}`));
    },
  });

  // The engine is built only to follow contracts. Its buying switch is fixed
  // OFF, so this worker can never start a trade.
  engine = new TradingEngine({
    userId,
    accountId,
    store: store as unknown as ConstructorParameters<typeof TradingEngine>[0]["store"],
    buyingEnabled: () => false,
    riskGate: denyAllUntilRiskEngine,
    getSignal: async () => null,
    getContractTypes: async () => {
      throw new Error("not available in the worker");
    },
    connection,
    log,
  });

  reconciler = new Reconciler({
    accountId,
    connection,
    store: { findIntentsNeedingReconciliation, moveIntent, confirmPurchase, findContractByDerivId },
    log: (m) => log(`${accountId}: ${m}`),
  });

  async function onStatus(status: ConnectionStatus): Promise<void> {
    log(`${accountId}: ${status}`);
    if (status === "open") {
      const unsettled = await listUnsettledContracts(accountId);
      for (const c of unsettled) connection.watchContract(c.derivContractId);
      log(`${accountId}: following ${unsettled.length} unfinished contract(s)`);
    }
    if (status === "auth_failed") {
      clearInterval(timer);
      await db.update(derivConnections).set({ status: "invalid" }).where(eq(derivConnections.userId, userId));
      log(`${accountId}: Deriv refused the token. Connection marked invalid; this account is stopped.`);
    }
  }

  timer = setInterval(() => {
    reconciler
      .reconcileOnce()
      .then((s) => {
        if (s.checked > 0) log(`${accountId}: doubt check ${JSON.stringify(s)}`);
      })
      .catch((error) => log(`${accountId}: doubt check failed: ${message(error)}`));
  }, RECONCILE_EVERY_MS);

  connection.start();
  running.push({ accountId, connection, timer });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function main(): Promise<void> {
  log("starting. This worker never buys: it follows contracts and settles purchases left in doubt.");
  const targets = await loadTargets();
  log(`${targets.length} demo account(s) to look after`);
  for (const t of targets) startAccount(t);

  const heartbeat = setInterval(() => {
    log(`alive: ${running.length} account(s), ${running.filter((r) => r.connection.getStatus() === "open").length} connected`);
  }, HEARTBEAT_EVERY_MS);

  async function shutdown(): Promise<void> {
    log("stopping");
    clearInterval(heartbeat);
    for (const r of running) {
      clearInterval(r.timer);
      r.connection.stop();
    }
    await sql.end({ timeout: 5 });
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[worker] failed to start:", message(error));
  process.exit(1);
});