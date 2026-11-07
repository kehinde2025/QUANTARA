import type { AccountConnection, ConnectionStatus, Reply } from "./accountConnection.js";

export type RunnerConnection = Pick<
  AccountConnection,
  "start" | "stop" | "getStatus" | "watchContract" | "unwatchContract" | "request"
>;

export type RunnerParts = {
  connection: RunnerConnection;
  engine: { onContractUpdate: (update: Reply) => Promise<void> };
  reconciler: { reconcileOnce: () => Promise<unknown> };
};

export type RunnerHandlers = {
  onStatus: (status: ConnectionStatus) => void;
  onContract: (contract: Reply) => void;
};

export type AccountRunnerDeps = {
  create: (handlers: RunnerHandlers) => RunnerParts;
  // Deriv ids of this account's contracts that still need following.
  listUnsettledContractIds: () => Promise<number[]>;
  // Deriv refused the token: mark the saved connection invalid.
  onAuthFailed: () => Promise<void>;
  reconcileEveryMs?: number;
  log?: (message: string) => void;
};

// Keeps one customer's demo account looked after: follows contracts again after
// every connection, checks purchases left in doubt, and stops if Deriv refuses
// the token.
export class AccountRunner {
  private readonly deps: AccountRunnerDeps;
  private parts: RunnerParts | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(deps: AccountRunnerDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.parts = this.deps.create({
      onStatus: (status) => {
        void this.onStatus(status);
      },
      onContract: (contract) => this.onContract(contract),
    });
    this.parts.connection.start();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.parts?.connection.stop();
  }

  private async onStatus(status: ConnectionStatus): Promise<void> {
    if (!this.running) return;
    if (status === "open") {
      await this.onOpen();
    } else if (status === "auth_failed") {
      this.clearTimer();
      try {
        await this.deps.onAuthFailed();
      } catch (error) {
        this.log(`could not mark the connection invalid: ${describe(error)}`);
      }
    }
  }

  private async onOpen(): Promise<void> {
    const parts = this.parts;
    if (!parts) return;
    try {
      for (const id of await this.deps.listUnsettledContractIds()) parts.connection.watchContract(id);
    } catch (error) {
      this.log(`could not restore contract tracking: ${describe(error)}`);
    }
    await this.reconcile();
    if (!this.timer && this.running) {
      this.timer = setInterval(() => {
        if (this.parts?.connection.getStatus() === "open") void this.reconcile();
      }, this.deps.reconcileEveryMs ?? 30_000);
    }
  }

  private async reconcile(): Promise<void> {
    try {
      await this.parts?.reconciler.reconcileOnce();
    } catch (error) {
      this.log(`recovery check failed: ${describe(error)}`);
    }
  }

  private onContract(contract: Reply): void {
    this.parts?.engine.onContractUpdate(contract).catch((error) => {
      this.log(`could not handle a contract update: ${describe(error)}`);
    });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}