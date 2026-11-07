import { describe, expect, it } from "vitest";
import type { ConnectionStatus, Reply } from "./accountConnection.js";
import { AccountRunner } from "./accountRunner.js";
import type { AccountRunnerDeps, RunnerHandlers, RunnerParts } from "./accountRunner.js";

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function setup(over: Partial<AccountRunnerDeps> = {}) {
  let handlers!: RunnerHandlers;
  let status: ConnectionStatus = "closed";
  const watched: number[] = [];
  const updates: Reply[] = [];
  const counts = { reconciles: 0, authFailed: 0, started: 0, stopped: 0 };

  const parts: RunnerParts = {
    connection: {
      start: () => {
        counts.started++;
      },
      stop: () => {
        counts.stopped++;
      },
      getStatus: () => status,
      watchContract: (id) => {
        watched.push(id);
      },
      unwatchContract: () => {},
      request: async () => ({}),
    },
    engine: {
      onContractUpdate: async (update) => {
        updates.push(update);
      },
    },
    reconciler: {
      reconcileOnce: async () => {
        counts.reconciles++;
      },
    },
  };

  const runner = new AccountRunner({
    create: (h) => {
      handlers = h;
      return parts;
    },
    listUnsettledContractIds: async () => [101, 102],
    onAuthFailed: async () => {
      counts.authFailed++;
    },
    reconcileEveryMs: 30,
    log: () => {},
    ...over,
  });

  const setStatus = (next: ConnectionStatus) => {
    status = next;
    handlers.onStatus(next);
  };
  return { runner, counts, watched, updates, setStatus, emit: (c: Reply) => handlers.onContract(c) };
}

describe("AccountRunner", () => {
  it("starts the connection, and once open follows every unsettled contract and runs a recovery check", async () => {
    const t = setup();
    t.runner.start();
    expect(t.counts.started).toBe(1);
    t.setStatus("open");
    await waitFor(() => t.counts.reconciles >= 1 && t.watched.length === 2);
    expect(t.watched).toEqual([101, 102]);
    t.runner.stop();
  });

  it("repeats the recovery check on a timer while connected", async () => {
    const t = setup();
    t.runner.start();
    t.setStatus("open");
    await waitFor(() => t.counts.reconciles >= 3);
    t.runner.stop();
  });

  it("does not run the recovery check while the connection is down", async () => {
    const t = setup();
    t.runner.start();
    t.setStatus("open");
    await waitFor(() => t.counts.reconciles >= 1);
    t.setStatus("closed");
    const before = t.counts.reconciles;
    await new Promise((r) => setTimeout(r, 150));
    expect(t.counts.reconciles).toBe(before);
    t.runner.stop();
  });

  it("passes contract updates to the engine", async () => {
    const t = setup();
    t.runner.start();
    t.emit({ contract_id: 101, is_sold: 0 });
    await waitFor(() => t.updates.length === 1);
    expect(t.updates[0]!.contract_id).toBe(101);
    t.runner.stop();
  });

  it("marks the connection invalid once when Deriv refuses the token, and stops checking", async () => {
    const t = setup();
    t.runner.start();
    t.setStatus("open");
    await waitFor(() => t.counts.reconciles >= 1);
    t.setStatus("auth_failed");
    await waitFor(() => t.counts.authFailed === 1);
    const before = t.counts.reconciles;
    await new Promise((r) => setTimeout(r, 150));
    expect(t.counts.authFailed).toBe(1);
    expect(t.counts.reconciles).toBe(before);
    t.runner.stop();
  });

  it("stops the connection and the timer when stopped", async () => {
    const t = setup();
    t.runner.start();
    t.setStatus("open");
    await waitFor(() => t.counts.reconciles >= 1);
    t.runner.stop();
    expect(t.counts.stopped).toBe(1);
    const before = t.counts.reconciles;
    await new Promise((r) => setTimeout(r, 150));
    expect(t.counts.reconciles).toBe(before);
  });
});