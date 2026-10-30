import { AccountConnection } from "./accountConnection.js";
import { listAccounts } from "./client.js";
import { requestOtpUrl } from "./otp.js";

const token = process.env.DERIV_TOKEN;
if (!token) {
  console.log("Set DERIV_TOKEN in this terminal first (see the instructions).");
  process.exit(1);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const accounts = await listAccounts(token!);
  if (!accounts.ok) throw new Error(`could not list accounts: ${accounts.reason}`);
  const demo = accounts.accounts.find((a) => a.accountType === "demo");
  if (!demo) throw new Error("no demo account found");
  console.log(`using demo account ${demo.accountId}`);

  const conn = new AccountConnection({
    getUrl: () => requestOtpUrl({ token: token!, accountId: demo.accountId, accountType: "demo" }),
    onStatus: (status) => console.log(`status: ${status}`),
    onContract: () => {},
  });
  conn.start();

  for (let i = 0; i < 100 && conn.getStatus() !== "open"; i++) await wait(100);
  if (conn.getStatus() !== "open") throw new Error(`did not connect (status ${conn.getStatus()})`);

  const reply = await conn.request({ balance: 1 });
  const balance = reply.balance as { balance?: unknown; currency?: unknown } | undefined;
  console.log(`balance: ${String(balance?.balance)} ${String(balance?.currency)}`);

  console.log("staying connected for 20 seconds...");
  await wait(20_000);
  console.log(`still ${conn.getStatus()}`);

  conn.stop();
  process.exit(0);
}

main().catch((error) => {
  console.error("live check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});