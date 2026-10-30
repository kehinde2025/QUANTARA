import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { WebSocket as ServerSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { AccountConnection } from "./accountConnection.js";
import type { AccountConnectionOptions, ConnectionStatus, Reply } from "./accountConnection.js";
import type { OtpResult } from "./otp.js";

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

function makeConn(getUrl: AccountConnectionOptions["getUrl"], extra: Partial<AccountConnectionOptions> = {}) {
  const statuses: ConnectionStatus[] = [];
  const contracts: Reply[] = [];
  const conn = new AccountConnection({
    getUrl,
    onStatus: (s) => statuses.push(s),
    onContract: (c) => contracts.push(c),
    pingIntervalMs: 60_000,
    silenceTimeoutMs: 120_000,
    requestTimeoutMs: 2_000,
    backoffBaseMs: 10,
    backoffMaxMs: 40,
    ...extra,
  });
  cleanups.push(() => conn.stop());
  return { conn, statuses, contracts };
}

const urlFor =
  (server: { url: string }) =>
  async (): Promise<OtpResult> => ({ ok: true, url: server.url });

const contractMsg = (contractId: number) =>
  JSON.stringify({
    msg_type: "proposal_open_contract",
    proposal_open_contract: { contract_id: contractId, is_sold: 0, is_expired: 0, status: "open" },
    subscription: { id: SUB_ID },
  });

describe("AccountConnection", () => {
  it("connects and matches a reply to its request by req_id", async () => {
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.balance) {
          socket.send(JSON.stringify({ msg_type: "balance", req_id: msg.req_id, balance: { balance: 100 } }));
        }
      });
    });
    const { conn, statuses } = makeConn(urlFor(server));
    conn.start();
    await waitFor(() => conn.getStatus() === "open");
    const reply = await conn.request({ balance: 1 });
    expect(reply.msg_type).toBe("balance");
    expect(typeof reply.req_id).toBe("number");
    expect(statuses).toContain("open");
  });

  it("asks for a fresh one-time pass on every reconnect", async () => {
    const server = await startServer((socket, index) => {
      if (index === 0) setTimeout(() => socket.terminate(), 20);
    });
    let asked = 0;
    const { conn } = makeConn(async () => {
      asked++;
      return { ok: true, url: server.url };
    });
    conn.start();
    await waitFor(() => server.connections() >= 2 && conn.getStatus() === "open");
    expect(asked).toBeGreaterThanOrEqual(2);
  });

  it("stops and reports auth_failed when the token is refused", async () => {
    let asked = 0;
    const { conn, statuses } = makeConn(async () => {
      asked++;
      return { ok: false, reason: "auth_failed" };
    });
    conn.start();
    await waitFor(() => conn.getStatus() === "auth_failed");
    await new Promise((r) => setTimeout(r, 150));
    expect(asked).toBe(1); // no retry loop
    expect(statuses[statuses.length - 1]).toBe("auth_failed");
  });

  it("keeps trying when Deriv is only temporarily unreachable", async () => {
    const server = await startServer(() => {});
    let asked = 0;
    const { conn } = makeConn(async () => {
      asked++;
      return asked === 1 ? { ok: false, reason: "unreachable" } : { ok: true, url: server.url };
    });
    conn.start();
    await waitFor(() => conn.getStatus() === "open");
    expect(asked).toBe(2);
  });

  it("says a request was never sent when there is no connection", async () => {
    const { conn } = makeConn(async () => ({ ok: false, reason: "unreachable" }));
    await expect(conn.request({ balance: 1 })).rejects.toMatchObject({ code: "not_connected", sent: false });
  });

  it("says a request may have been sent when the connection drops before the reply", async () => {
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.buy) socket.terminate();
      });
    });
    const { conn } = makeConn(urlFor(server));
    conn.start();
    await waitFor(() => conn.getStatus() === "open");
    await expect(conn.request({ buy: "x", price: 1 })).rejects.toMatchObject({
      code: "connection_closed",
      sent: true,
    });
  });

  it("says a request may have been sent when no answer comes back", async () => {
    const server = await startServer(() => {
      // never answers
    });
    const { conn } = makeConn(urlFor(server), { requestTimeoutMs: 100 });
    conn.start();
    await waitFor(() => conn.getStatus() === "open");
    await expect(conn.request({ buy: "x", price: 1 })).rejects.toMatchObject({ code: "timeout", sent: true });
  });

  it("follows a contract and follows it again after a reconnect", async () => {
    const subscribes: unknown[] = [];
    const server = await startServer((socket, index) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (!msg.proposal_open_contract) return;
        subscribes.push(msg);
        socket.send(contractMsg(55));
        if (index === 0) setTimeout(() => socket.terminate(), 40);
      });
    });
    const { conn, contracts } = makeConn(urlFor(server));
    conn.watchContract(55);
    conn.start();
    await waitFor(() => contracts.length >= 2 && subscribes.length >= 2);
    expect(contracts[0]!.contract_id).toBe(55);
    expect(server.connections()).toBeGreaterThanOrEqual(2);
  });

  it("cancels the stream when it stops following a contract", async () => {
    const forgotten: string[] = [];
    const server = await startServer((socket) => {
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.proposal_open_contract) socket.send(contractMsg(55));
        if (typeof msg.forget === "string") forgotten.push(msg.forget);
      });
    });
    const { conn, contracts } = makeConn(urlFor(server));
    conn.start();
    await waitFor(() => conn.getStatus() === "open");
    conn.watchContract(55);
    await waitFor(() => contracts.length === 1);
    conn.unwatchContract(55);
    await waitFor(() => forgotten.length === 1);
    expect(forgotten[0]).toBe(SUB_ID);
  });

  it("reconnects when the server goes silent", async () => {
    const server = await startServer(() => {
      // never answers anything
    });
    const { conn } = makeConn(urlFor(server), { pingIntervalMs: 40, silenceTimeoutMs: 120 });
    conn.start();
    await waitFor(() => server.connections() >= 2, 5000);
    expect(server.connections()).toBeGreaterThanOrEqual(2);
  });
});