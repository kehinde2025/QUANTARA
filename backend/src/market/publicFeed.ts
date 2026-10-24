import WebSocket from "ws";

export type FeedStatus = "connecting" | "open" | "closed";

export type Tick = { symbol: string; quote: number; epoch: number; decimals: number };

export type Reply = Record<string, unknown>;

export type PublicFeedOptions = {
  url: string;
  onTick: (tick: Tick) => void;
  onStatus: (status: FeedStatus) => void;
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

// Used for tick and history replies, where Deriv documents pip_size as the
// number of decimal places. A step size such as 0.01 is accepted too.
export function toDecimals(pip: unknown): number {
  if (typeof pip !== "number" || !Number.isFinite(pip) || pip <= 0) return 2;
  if (pip < 1) return Math.min(10, Math.max(0, Math.round(-Math.log10(pip))));
  return Math.min(10, Math.round(pip));
}

function parseTick(msg: Reply): Tick | null {
  const t = msg.tick as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return null;
  const { symbol, quote, epoch, pip_size: pip } = t;
  if (typeof symbol !== "string" || typeof quote !== "number" || typeof epoch !== "number") return null;
  return { symbol, quote, epoch, decimals: toDecimals(pip) };
}

// One connection to Deriv's public feed (no login). Reconnects by itself and
// restores every price subscription after a drop.
export class PublicFeed {
  private readonly opts: PublicFeedOptions;
  private readonly cfg: {
    pingIntervalMs: number;
    silenceTimeoutMs: number;
    requestTimeoutMs: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
  };
  private ws: WebSocket | null = null;
  private status: FeedStatus = "closed";
  private running = false;
  private attempt = 0;
  private openedAt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private nextReqId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly desired = new Set<string>();
  private readonly subscriptionIds = new Map<string, string>();

  constructor(opts: PublicFeedOptions) {
    this.opts = opts;
    this.cfg = {
      pingIntervalMs: opts.pingIntervalMs ?? 30_000,
      silenceTimeoutMs: opts.silenceTimeoutMs ?? 45_000,
      requestTimeoutMs: opts.requestTimeoutMs ?? 15_000,
      backoffBaseMs: opts.backoffBaseMs ?? 1_000,
      backoffMaxMs: opts.backoffMaxMs ?? 30_000,
    };
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  msSinceLastMessage(): number | null {
    return this.lastMessageAt === 0 ? null : Date.now() - this.lastMessageAt;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearPing();
    this.rejectAll(new Error("feed_stopped"));
    const ws = this.ws;
    this.ws = null;
    ws?.terminate();
    this.setStatus("closed");
  }

  // One-off request. The reply is matched by req_id. Rejects on timeout or if
  // the connection drops before the reply arrives.
  request(payload: Record<string, unknown>): Promise<Reply> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("not_connected"));
    return new Promise<Reply>((resolve, reject) => {
      const id = this.nextReqId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("timeout"));
      }, this.cfg.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...payload, req_id: id }), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  subscribeTicks(symbol: string): void {
    if (this.desired.has(symbol)) return;
    this.desired.add(symbol);
    this.sendRaw({ ticks: symbol, subscribe: 1 });
  }

  unsubscribeTicks(symbol: string): void {
    if (!this.desired.delete(symbol)) return;
    const id = this.subscriptionIds.get(symbol);
    this.subscriptionIds.delete(symbol);
    if (id) this.sendRaw({ forget: id });
  }

  private connect(): void {
    if (!this.running) return;
    this.setStatus("connecting");
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.openedAt = Date.now();
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      this.startPing();
      for (const symbol of this.desired) this.sendRaw({ ticks: symbol, subscribe: 1 });
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
    this.rejectAll(new Error("connection_closed"));
    this.setStatus("closed");
    if (!this.running) return;

    // Only forget past failures after a connection stayed up for a while.
    if (this.openedAt > 0 && Date.now() - this.openedAt > 10_000) this.attempt = 0;
    const exp = Math.min(this.cfg.backoffMaxMs, this.cfg.backoffBaseMs * 2 ** this.attempt);
    const delay = Math.round(exp * (0.5 + Math.random() * 0.5));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
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

    if (typeof msg.req_id === "number") {
      const p = this.pending.get(msg.req_id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.req_id);
        p.resolve(msg);
      }
    }

    const tick = parseTick(msg);
    if (!tick) return;

    const subId = (msg.subscription as { id?: unknown } | undefined)?.id;
    if (!this.desired.has(tick.symbol)) {
      // Unsubscribed before the first tick arrived: cancel the stream now.
      if (typeof subId === "string") this.sendRaw({ forget: subId });
      return;
    }
    if (typeof subId === "string" && !this.subscriptionIds.has(tick.symbol)) {
      this.subscriptionIds.set(tick.symbol, subId);
    }
    this.opts.onTick(tick);
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

  private rejectAll(error: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
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

  private setStatus(next: FeedStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus(next);
  }
}