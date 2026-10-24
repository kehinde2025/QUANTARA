import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { WebSocket as ServerSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { PublicFeed, toDecimals } from "./publicFeed.js";
import type { FeedStatus, PublicFeedOptions, Tick } from "./publicFeed.js";

const SUB_ID = "sub-" + "x".repeat(32);
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

type Handler = (socket: ServerSocket, connectionIndex: number) => void;

async function startServer(onConnection: Handler) {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  let count = 0;
  wss.on("connection", (socket) => onConnection(socket, count++));
  cleanups.push(() => {
    wss.clients.forEach((c) => c.terminate());
    wss.close();
  });
  const url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  return { url, connections: () => count };
}

async function waitFor(check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function makeFeed(url: string, extra: Partial<PublicFeedOptions> = {}) {
  const ticks: Tick[] = [];
  const statuses: FeedStatus[] = [];
  const feed = new PublicFeed({
    url,
    onTick: (t) => ticks.push(t),
    onStatus: (s) => statuses.push(s),
    pingIntervalMs: 60_000,
    silenceTimeoutMs: 120_000,
    requestTimeoutMs: 2_000,
    backoffBaseMs: 10,
    backoffMaxMs: 40,
    ...extra,
  });
  cleanups.push(() => feed.stop());
  return { feed, ticks, statuses };
}

const tickMsg = (symbol: string, quote: number, epoch: number) =>
  JSON.stringify({
    msg_type: "tick",
    tick: { symbol, quote, epoch, pip_size: 2, id: SUB_ID },
    subscription: { id: SUB_ID },
  });

describe("toDecimals", () => {
  it("reads Deriv pip sizes as decimal places", () => {
    expect(toDecimals(2)).toBe(2);
    expect(toDecimals(0.01)).toBe(2);
    expect(toDecimals(0.001)).toBe(3);
    expect(toDecimals(undefined)).toBe(2);
    expect(toDecimals(0)).toBe(2);
  });
});

describe("PublicFeed", () => {
  it("parses ticks and reports its status", async () => {
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.ticks === "R_100") socket.send(tickMsg("R_100", 101.5, 1000));
      });
    });
    const { feed, ticks, statuses } = makeFeed(server.url);
    feed.subscribeTicks("R_100");
    feed.start();
    await waitFor(() => ticks.length === 1);
    expect(ticks[0]).toEqual({ symbol: "R_100", quote: 101.5, epoch: 1000, decimals: 2 });
    expect(statuses).toContain("open");
    expect(feed.getStatus()).toBe("open");
  });

  it("reconnects and resubscribes after the server drops the connection", async () => {
    const server = await startServer((socket, index) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.ticks !== "R_100") return;
        if (index === 0) socket.terminate();
        else socket.send(tickMsg("R_100", 55, 2000));
      });
    });
    const { feed, ticks, statuses } = makeFeed(server.url);
    feed.subscribeTicks("R_100");
    feed.start();
    await waitFor(() => ticks.length === 1);
    expect(server.connections()).toBe(2);
    expect(statuses.filter((s) => s === "closed").length).toBeGreaterThanOrEqual(1);
    expect(statuses[statuses.length - 1]).toBe("open");
  });

  it("matches a reply to its request by req_id", async () => {
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.active_symbols) {
          socket.send(JSON.stringify({ msg_type: "active_symbols", req_id: msg.req_id, active_symbols: [] }));
        }
      });
    });
    const { feed } = makeFeed(server.url);
    feed.start();
    await waitFor(() => feed.getStatus() === "open");
    const reply = await feed.request({ active_symbols: "brief" });
    expect(reply.msg_type).toBe("active_symbols");
    expect(typeof reply.req_id).toBe("number");
  });

  it("rejects requests that cannot be answered", async () => {
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.active_symbols) socket.terminate();
      });
    });
    const { feed } = makeFeed(server.url);
    await expect(feed.request({ ping: 1 })).rejects.toThrow("not_connected");
    feed.start();
    await waitFor(() => feed.getStatus() === "open");
    await expect(feed.request({ active_symbols: "brief" })).rejects.toThrow("connection_closed");
  });

  it("reconnects when the server goes silent", async () => {
    const server = await startServer(() => {
      // never answers anything
    });
    const { feed } = makeFeed(server.url, { pingIntervalMs: 40, silenceTimeoutMs: 120 });
    feed.start();
    await waitFor(() => server.connections() >= 2, 5000);
    expect(server.connections()).toBeGreaterThanOrEqual(2);
  });

  it("subscribes to a symbol only once", async () => {
    const received: unknown[] = [];
    const server = await startServer((socket) => {
      socket.on("message", (raw) => received.push(JSON.parse(raw.toString())));
    });
    const { feed } = makeFeed(server.url);
    feed.subscribeTicks("R_100");
    feed.subscribeTicks("R_100");
    feed.start();
    await waitFor(() => received.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(received.filter((m) => (m as { ticks?: string }).ticks === "R_100")).toHaveLength(1);
  });

  it("cancels the stream on unsubscribe", async () => {
    const forgotten: string[] = [];
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.ticks === "R_100") socket.send(tickMsg("R_100", 1, 1));
        if (typeof msg.forget === "string") forgotten.push(msg.forget);
      });
    });
    const { feed, ticks } = makeFeed(server.url);
    feed.subscribeTicks("R_100");
    feed.start();
    await waitFor(() => ticks.length === 1);
    feed.unsubscribeTicks("R_100");
    await waitFor(() => forgotten.length === 1);
    expect(forgotten[0]).toBe(SUB_ID);
  });
});