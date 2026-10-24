export type StoredTick = { quote: number; epoch: number };

type Entry = { ticks: StoredTick[]; decimals: number; lastLiveAt: number | null };

// In-memory prices. A price is LIVE only if it arrived on the live stream.
// History from Deriv fills the chart but never makes a symbol "live".
export class TickStore {
  private readonly maxTicks: number;
  private readonly entries = new Map<string, Entry>();

  constructor(maxTicks = 2000) {
    this.maxTicks = maxTicks;
  }

  private entry(symbol: string, decimals: number): Entry {
    let e = this.entries.get(symbol);
    if (!e) {
      e = { ticks: [], decimals, lastLiveAt: null };
      this.entries.set(symbol, e);
    }
    return e;
  }

  // Returns false for a duplicate or a tick older than what we already have.
  addLive(symbol: string, tick: StoredTick, decimals: number, now = Date.now()): boolean {
    const e = this.entry(symbol, decimals);
    const last = e.ticks[e.ticks.length - 1];
    if (last && tick.epoch <= last.epoch) return false;
    e.ticks.push(tick);
    if (e.ticks.length > this.maxTicks) e.ticks.splice(0, e.ticks.length - this.maxTicks);
    e.decimals = decimals;
    e.lastLiveAt = now;
    return true;
  }

  // History from Deriv. Newer live ticks are kept. Does NOT count as live data.
  seed(symbol: string, history: StoredTick[], decimals: number): void {
    const e = this.entry(symbol, decimals);
    const byEpoch = new Map<number, StoredTick>();
    for (const t of history) byEpoch.set(t.epoch, t);
    const sorted = [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch);
    const lastHistory = sorted[sorted.length - 1]?.epoch ?? -Infinity;
    const newer = e.ticks.filter((t) => t.epoch > lastHistory);
    const merged = [...sorted, ...newer];
    e.ticks = merged.length > this.maxTicks ? merged.slice(merged.length - this.maxTicks) : merged;
    e.decimals = decimals;
  }

  latest(symbol: string): (StoredTick & { decimals: number; lastLiveAt: number | null }) | null {
    const e = this.entries.get(symbol);
    const t = e?.ticks[e.ticks.length - 1];
    if (!e || !t) return null;
    return { ...t, decimals: e.decimals, lastLiveAt: e.lastLiveAt };
  }

  recent(symbol: string, count: number): StoredTick[] {
    const e = this.entries.get(symbol);
    return e ? e.ticks.slice(-count) : [];
  }

  // Milliseconds since the last LIVE tick, or null if there never was one.
  ageMs(symbol: string, now = Date.now()): number | null {
    const at = this.entries.get(symbol)?.lastLiveAt;
    return at == null ? null : now - at;
  }

  isStale(symbol: string, staleAfterMs: number, now = Date.now()): boolean {
    const age = this.ageMs(symbol, now);
    return age === null || age > staleAfterMs;
  }
}