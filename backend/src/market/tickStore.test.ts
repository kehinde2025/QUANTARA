import { describe, expect, it } from "vitest";
import { TickStore } from "./tickStore.js";

const tick = (epoch: number) => ({ epoch, quote: 100 + epoch });

describe("TickStore", () => {
  it("stores live ticks in order and ignores duplicates and older ticks", () => {
    const s = new TickStore();
    expect(s.addLive("R_100", tick(10), 2)).toBe(true);
    expect(s.addLive("R_100", tick(11), 2)).toBe(true);
    expect(s.addLive("R_100", tick(11), 2)).toBe(false);
    expect(s.addLive("R_100", tick(9), 2)).toBe(false);
    expect(s.recent("R_100", 10).map((t) => t.epoch)).toEqual([10, 11]);
  });

  it("keeps only the newest ticks up to its limit", () => {
    const s = new TickStore(3);
    for (let e = 1; e <= 5; e++) s.addLive("R_100", tick(e), 2);
    expect(s.recent("R_100", 10).map((t) => t.epoch)).toEqual([3, 4, 5]);
  });

  it("treats a symbol that never had a live tick as stale", () => {
    const s = new TickStore();
    expect(s.isStale("R_100", 15_000)).toBe(true);
    expect(s.ageMs("R_100")).toBeNull();
    expect(s.latest("R_100")).toBeNull();
  });

  it("is fresh right after a live tick and stale after the threshold", () => {
    const s = new TickStore();
    s.addLive("R_100", tick(1), 2, 1_000);
    expect(s.isStale("R_100", 15_000, 1_000)).toBe(false);
    expect(s.isStale("R_100", 15_000, 15_999)).toBe(false);
    expect(s.isStale("R_100", 15_000, 16_001)).toBe(true);
  });

  it("does not count history as live data", () => {
    const s = new TickStore();
    s.seed("R_100", [tick(1), tick(2)], 2);
    expect(s.isStale("R_100", 15_000)).toBe(true);
    expect(s.latest("R_100")?.epoch).toBe(2);
    expect(s.latest("R_100")?.lastLiveAt).toBeNull();
  });

  it("keeps newer live ticks when history is added and drops duplicates", () => {
    const s = new TickStore();
    s.addLive("R_100", tick(100), 2);
    s.addLive("R_100", tick(101), 2);
    s.seed("R_100", [tick(98), tick(99), tick(100), tick(100)], 2);
    expect(s.recent("R_100", 10).map((t) => t.epoch)).toEqual([98, 99, 100, 101]);
  });

  it("returns the last N ticks", () => {
    const s = new TickStore();
    for (let e = 1; e <= 5; e++) s.addLive("R_100", tick(e), 2);
    expect(s.recent("R_100", 2).map((t) => t.epoch)).toEqual([4, 5]);
    expect(s.recent("UNKNOWN", 2)).toEqual([]);
  });
});