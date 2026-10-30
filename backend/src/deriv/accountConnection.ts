import WebSocket from "ws";
import type { OtpResult } from "./otp.js";

export type ConnectionStatus = "connecting" | "open" | "closed" | "auth_failed";

export type Reply = Record<string, unknown>;

// Why a request failed, and whether it may have reached Deriv.
//   not_connected     sent = false  -> it was never sent. Safe to try again.
//   connection_closed sent = true   -> sent, then the connection dropped.
//   timeout           sent = true   -> sent, and no answer came back.
// With sent = true the outcome is UNKNOWN. For a purchase that means
// "uncertain": check Deriv's records, never just send it again.
export class RequestError extends Error {
  readonly code: "not_connected" | "connection_closed" | "timeout";
  readonly sent: boolean;
  constructor(code: "not_connected" | "connection_closed" | "timeout", sent: boolean) {
    super(code);
    this.name = "RequestError";
    this.code = code;
    this.sent = sent;
  }
}

export type AccountConnectionOptions = {
  // Asks Deriv for a fresh one-time pass. Called for EVERY connection attempt,
  // because a pass can only be used once.
  getUrl: () => Promise<OtpResult>;
  onStatus: (status: ConnectionStatus) => void;
  // Called for every update of a contract being watched.
  onContract: (contract: Reply) => void;
  pingIntervalMs?: number;
  silenceTimeoutMs?: number;
  requestTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
};

type Pending = {
  resolve: (reply: Reply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

// One authenticated connection for one Deriv account.
export class AccountConnection {
  private readonly opts: AccountConnectionOptions;
  private readonly cfg: {
    pingIntervalMs: number;
    silenceTimeoutMs: number;
    requestTimeoutMs: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
  };
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "closed";
  private running = false;
  private attempt = 0;
  private openedAt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private nextReqId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly watched = new Set<number>();
  // Subscription ids so a stream can be cancelled (taken from Deriv's replies).
  private readonly subscriptionIds = new Map<number, string>();

  constructor(opts: AccountConnectionOptions) {
    this.opts = opts;
    this.cfg = {
      pingIntervalMs: opts.pingIntervalMs ?? 30_000,
      silenceTimeoutMs: opts.silenceTimeoutMs ?? 45_000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 15_000,
      backoffBaseMs: opts.backoffBaseMs ?? 1_000,
      backoffMaxMs: opts.backoffMaxMs ?? 30_000,
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearPing();
    this.rejectAll();
    const ws = this.ws;
    this.ws = null;
    ws?.terminate();
    this.setStatus("closed");
  }

  request(payload: Record<string, unknown>): Promise<Reply> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new RequestError("not_connected", false));
    return new Promise<Reply>((resolve, reject) => {
      const id = this.nextReqId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RequestError("timeout", true));
      }, this.cfg.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ ...payload, req_id: id }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new RequestError("not_connected", false));
      }
    });
  }

  // Follows a contract. Updates arrive through onContract and are restored
  // after a reconnect.
  watchContract(contractId: number): void {
    if (this.watched.has(contractId)) return;
    this.watched.add(contractId);
    this.sendRaw({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
  }

  unwatchContract(contractId: number): void {
    if (!this.watched.delete(contractId)) return;
    const id = this.subscriptionIds.get(contractId);
    this.subscriptionIds.delete(contractId);
    if (id) this.sendRaw({ forget: id });
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.setStatus("connecting");

    let otp: OtpResult;
    try {
      otp = await this.opts.getUrl();
    } catch {
      otp = { ok: false, reason: "unreachable" };
    }
    if (!this.running) return;

    if (!otp.ok) {
      if (otp.reason === "auth_failed" || otp.reason === "not_configured") {
        // Deriv will not accept this token (or the server is not set up).
        // Trying again would only hammer Deriv, so stop and tell the owner.
        this.running = false;
        this.setStatus("auth_failed");
        return;
      }
      this.setStatus("closed");
      this.scheduleReconnect();
      return;
    }

    const ws = new WebSocket(otp.url);
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.openedAt = Date.now();
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      this.startPing();
      for (const contractId of this.watched) {
        this.sendRaw({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
      }
    });
    ws.on("message", (raw: WebSocket.RawData) => {
      if (this.ws === ws) this.handleMessage(raw);
    });
    ws.on("close", () => this.onClosed(ws));
    // A "close" event always follows an error, and the reconnect happens there.
    ws.on("error", () => {});
  }

  private onClosed(ws: WebSocket): void {
    if (this.ws !== ws) return;
    this.ws = null;
    this.clearPing();
    this.subscriptionIds.clear();
    this.rejectAll();
    this.setStatus("closed");
    if (this.running) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    // Only forget past failures after a connection stayed up for a while.
    if (this.openedAt > 0 && Date.now() - this.openedAt > 10_000) this.attempt = 0;
    const exp = Math.min(this.cfg.backoffMaxMs, this.cfg.backoffBaseMs * 2 ** this.attempt);
    const delay = Math.round(exp * (0.5 + Math.random() * 0.5));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private handleMessage(raw: WebSocket.RawData): void {
    this.lastMessageAt = Date.now();
    let msg: Reply;
    try {
      msg = JSON.parse(raw.toString()) as Reply;
    } catch {
      return;
    }

    // A reply to a request we made: hand it to whoever asked.
    if (typeof msg.req_id === "number") {
      const p = this.pending.get(msg.req_id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.req_id);
        p.resolve(msg);
        return;
      }
    }

    // Otherwise it is an update on a contract we are watching.
    const contract = msg.proposal_open_contract as Reply | undefined;
    if (msg.msg_type !== "proposal_open_contract" || !contract || typeof contract !== "object") return;

    const contractId = Number(contract.contract_id);
    const subId = (msg.subscription as { id?: unknown } | undefined)?.id;
    if (!this.watched.has(contractId)) {
      // Stopped watching before this arrived: cancel the stream.
      if (typeof subId === "string") this.sendRaw({ forget: subId });
      return;
    }
    if (typeof subId === "string" && !this.subscriptionIds.has(contractId)) {
      this.subscriptionIds.set(contractId, subId);
    }
    this.opts.onContract(contract);
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      // Nothing heard for too long: the connection is dead. Drop it and reconnect.
      if (Date.now() - this.lastMessageAt > this.cfg.silenceTimeoutMs) {
        ws.terminate();
        return;
      }
      this.sendRaw({ ping: 1 });
    }, this.cfg.pingIntervalMs);
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // The connection dropped: every request still waiting was sent, so its
  // outcome is unknown.
  private rejectAll(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new RequestError("connection_closed", true));
    }
    this.pending.clear();
  }

  private sendRaw(payload: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // The connection is going down; the close handler takes over.
    }
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus(next);
  }
}