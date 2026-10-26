import { z } from "zod";
import { DERIV_PUBLIC_WS_URL } from "../config.js";
import { PublicFeed, toDecimals } from "./publicFeed.js";
import type { FeedStatus, Reply, Tick } from "./publicFeed.js";
import { TickStore } from "./tickStore.js";
import { contractsForReply, summarizeContracts } from "./contracts.js";
import type { ContractTypeSummary } from "./contracts.js";
import type { StoredTick } from "./tickStore.js";
import type { Candle } from "../strategies/types.js";

// A price older than this is stale. Synthetic indices tick every 1 to 2 seconds.
export const STALE_AFTER_MS = 15_000;
const SYMBOLS_TTL_MS = 5 * 60_000;
const HISTORY_TTL_MS = 10_000;
const CONTRACTS_TTL_MS = 5 * 60_000;
const UNWATCH_GRACE_MS = 30_000;

export type SymbolInfo = {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  type: string;
  exchangeIsOpen: boolean;
  tradingSuspended: boolean;
};

export type HistoryResult = { symbol: string; decimals: number; ticks: StoredTick[] };

export type MarketEvent =
  | { type: "tick"; symbol: string; quote: number; epoch: number; decimals: number }
  | { type: "status"; feed: FeedStatus };

export class MarketError extends Error {
  readonly code: "unavailable" | "unexpected";
  constructor(code: "unavailable" | "unexpected", message: string) {
    super(message);
    this.name = "MarketError";
    this.code = code;
  }
}

const symbolsReply = z.object({
  active_symbols: z.array(
    z.object({
      underlying_symbol: z.string(),
      underlying_symbol_name: z.string(),
      market: z.string(),
      submarket: z.string().optional(),
      underlying_symbol_type: z.string().optional(),
      exchange_is_open: z.number().optional(),
      is_trading_suspended: z.number().optional(),
    }),
  ),
});

const historyReply = z.object({
  history: z.object({ prices: z.array(z.number()), times: z.array(z.number()) }),
  pip_size: z.number().optional(),
});

const candlesReply = z.object({
  candles: z.array(
    z.object({
      epoch: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
    }),
  ),
});

export class MarketService {
  readonly store = new TickStore();
  private readonly feed: PublicFeed;
  private symbolsCache: { at: number; data: SymbolInfo[] } | null = null;
  private readonly historyFetchedAt = new Map<string, number>();
  private readonly contractsCache = new Map<string, { at: number; data: ContractTypeSummary[] }>();
  private readonly listeners = new Map<string, Set<(e: MarketEvent) => void>>();
  private readonly unwatchTimers = new Map<string, NodeJS.Timeout>();

  constructor(url: string = DERIV_PUBLIC_WS_URL) {
    this.feed = new PublicFeed({
      url,
      onTick: (tick) => this.onTick(tick),
      onStatus: (feed) => this.onStatus(feed),
    });
  }

  start(): void {
    this.feed.start();
  }

  stop(): void {
    for (const timer of this.unwatchTimers.values()) clearTimeout(timer);
    this.unwatchTimers.clear();
    this.feed.stop();
  }

  snapshot(symbol: string) {
    const latest = this.store.latest(symbol);
    const feed = this.feed.getStatus();
    return {
      feed,
      silentForMs: this.feed.msSinceLastMessage(),
      latest: latest ? { quote: latest.quote, epoch: latest.epoch, decimals: latest.decimals } : null,
      ageMs: this.store.ageMs(symbol),
      // Stale when there is no recent LIVE tick, or the connection is down.
      stale: feed !== "open" || this.store.isStale(symbol, STALE_AFTER_MS),
    };
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    const now = Date.now();
    if (this.symbolsCache && now - this.symbolsCache.at < SYMBOLS_TTL_MS) return this.symbolsCache.data;

    const reply = await this.ask({ active_symbols: "brief" });
    const parsed = symbolsReply.safeParse(reply);
    if (!parsed.success) throw new MarketError("unexpected", "Unexpected reply for symbols");

    const data: SymbolInfo[] = parsed.data.active_symbols.map((s) => ({
      symbol: s.underlying_symbol,
      name: s.underlying_symbol_name,
      market: s.market,
      submarket: s.submarket ?? "",
      type: s.underlying_symbol_type ?? "",
      exchangeIsOpen: s.exchange_is_open === undefined ? true : s.exchange_is_open === 1,
      tradingSuspended: s.is_trading_suspended === 1,
    }));
    data.sort((a, b) => a.market.localeCompare(b.market) || a.name.localeCompare(b.name));
    this.symbolsCache = { at: now, data };
    return data;
  }

  async getHistory(symbol: string, count: number): Promise<HistoryResult> {
    const key = `${symbol}:${count}`;
    const now = Date.now();
    const fetchedAt = this.historyFetchedAt.get(key);
    if (fetchedAt !== undefined && now - fetchedAt < HISTORY_TTL_MS) return this.fromStore(symbol, count);

    const reply = await this.ask({ ticks_history: symbol, end: "latest", count, style: "ticks" });
    const parsed = historyReply.safeParse(reply);
    if (!parsed.success) throw new MarketError("unexpected", "Unexpected reply for history");

    const { prices, times } = parsed.data.history;
    const n = Math.min(prices.length, times.length);
    const ticks: StoredTick[] = [];
    for (let i = 0; i < n; i++) ticks.push({ epoch: times[i]!, quote: prices[i]! });
    this.store.seed(symbol, ticks, toDecimals(parsed.data.pip_size));

    if (this.historyFetchedAt.size > 200) this.historyFetchedAt.clear();
    this.historyFetchedAt.set(key, now);
    return this.fromStore(symbol, count);
  }


    // Recent candles from Deriv (granularity in seconds, for example 60).
  // The newest one may still be forming.
  async getCandles(symbol: string, count: number, granularity: number): Promise<Candle[]> {
    const reply = await this.ask({ ticks_history: symbol, end: "latest", count, style: "candles", granularity });
    const parsed = candlesReply.safeParse(reply);
    if (!parsed.success) throw new MarketError("unexpected", "Unexpected reply for candles");
    return parsed.data.candles.map((c) => ({
      epoch: c.epoch,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }
  // Which contract types Deriv lists for this market right now. Information
  // only: the bots must re-check the live list before every purchase.
  async getContractTypes(symbol: string): Promise<ContractTypeSummary[]> {
    const now = Date.now();
    const cached = this.contractsCache.get(symbol);
    if (cached && now - cached.at < CONTRACTS_TTL_MS) return cached.data;

    const reply = await this.ask({ contracts_for: symbol });
    const parsed = contractsForReply.safeParse(reply);
    if (!parsed.success) throw new MarketError("unexpected", "Unexpected reply for contracts");

    const data = summarizeContracts(parsed.data.contracts_for.available);
    if (this.contractsCache.size > 200) this.contractsCache.clear();
    this.contractsCache.set(symbol, { at: now, data });
    return data;
  }
  // Shared live subscription: one Deriv stream per symbol however many watch it.
  // Released 30 seconds after the last watcher leaves.
  watch(symbol: string, listener: (e: MarketEvent) => void): () => void {
    let set = this.listeners.get(symbol);
    if (!set) {
      set = new Set();
      this.listeners.set(symbol, set);
    }
    const mine = set;
    mine.add(listener);

    const pendingTimer = this.unwatchTimers.get(symbol);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.unwatchTimers.delete(symbol);
    }
    this.feed.subscribeTicks(symbol);

    let done = false;
    return () => {
      if (done) return;
      done = true;
      mine.delete(listener);
      if (mine.size > 0) return;
      this.unwatchTimers.set(
        symbol,
        setTimeout(() => {
          this.unwatchTimers.delete(symbol);
          if ((this.listeners.get(symbol)?.size ?? 0) === 0) {
            this.listeners.delete(symbol);
            this.feed.unsubscribeTicks(symbol);
          }
        }, UNWATCH_GRACE_MS),
      );
    };
  }

  private fromStore(symbol: string, count: number): HistoryResult {
    const latest = this.store.latest(symbol);
    return { symbol, decimals: latest?.decimals ?? 2, ticks: this.store.recent(symbol, count) };
  }

  private async ask(payload: Record<string, unknown>): Promise<Reply> {
    let reply: Reply;
    try {
      reply = await this.feed.request(payload);
    } catch {
      throw new MarketError("unavailable", "Market data connection is not available");
    }
    if (reply.error) throw new MarketError("unexpected", "Deriv rejected the market data request");
    return reply;
  }

  private onTick(tick: Tick): void {
    const added = this.store.addLive(tick.symbol, { quote: tick.quote, epoch: tick.epoch }, tick.decimals);
    if (!added) return;
    const event: MarketEvent = {
      type: "tick",
      symbol: tick.symbol,
      quote: tick.quote,
      epoch: tick.epoch,
      decimals: tick.decimals,
    };
    for (const listener of this.listeners.get(tick.symbol) ?? []) listener(event);
  }

  private onStatus(feed: FeedStatus): void {
    const event: MarketEvent = { type: "status", feed };
    for (const set of this.listeners.values()) for (const listener of set) listener(event);
  }
}