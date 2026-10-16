// File: spike/trade.mjs  (NEW FILE)
// Demo account only. One 1 USD, 5-tick CALL on R_100.
//   node trade.mjs        -> asks for a price only (NO purchase)
//   node trade.mjs buy    -> asks for a price, buys ONCE, waits for the result
// Request fields come from Deriv's published schemas. Response field names
// are not confirmed, so the script prints raw replies. UNTESTED.
const token = process.env.DERIV_TOKEN;
const appId = process.env.DERIV_APP_ID;
if (!token || !appId) {
  console.log("Set DERIV_TOKEN and DERIV_APP_ID in this window first.");
  process.exit(1);
}
const doBuy = process.argv[2] === "buy";
const STAKE = 1;
const MAX_ASK = 1.2; // refuse to buy above this price
const headers = {
  Authorization: `Bearer ${token}`,
  "Deriv-App-ID": appId,
  "Content-Type": "application/json",
};
const base = "https://api.derivws.com/trading/v1/options";
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const acc = await (await fetch(`${base}/accounts`, { headers })).json();
const demo = (acc.data ?? []).find((a) => a.account_type === "demo");
if (!demo) { log("No demo account found."); process.exit(1); }
const otpRes = await fetch(`${base}/accounts/${demo.account_id}/otp`, { method: "POST", headers });
const wsUrl = (await otpRes.text()).match(/wss:\/\/[^"\s]+/)?.[0];
if (!wsUrl || !wsUrl.includes("/ws/demo")) {
  log("Did not get a DEMO connection. Stopping. Status:", otpRes.status);
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
const pending = new Map();
let nextId = 1;
let onPoc = null;

function request(payload, ms = 15000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("timeout"));
    }, ms);
    pending.set(id, { resolve, timer });
    ws.send(JSON.stringify({ ...payload, req_id: id }));
  });
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.msg_type === "proposal_open_contract" && onPoc) onPoc(data);
  const p = pending.get(data.req_id);
  if (p) {
    clearTimeout(p.timer);
    pending.delete(data.req_id);
    p.resolve(data);
  }
};
ws.onerror = () => {};
ws.onclose = () => log("connection closed");
await new Promise((r) => (ws.onopen = r));
log("connected to DEMO account", demo.account_id);

const bal0 = await request({ balance: 1 });
log("balance before:", bal0.balance?.balance, bal0.balance?.currency);

const prop = await request({
  proposal: 1,
  contract_type: "CALL",
  underlying_symbol: "R_100",
  currency: demo.currency,
  amount: STAKE,
  basis: "stake",
  duration: 5,
  duration_unit: "t",
});
if (prop.error) {
  log("Proposal rejected:", JSON.stringify(prop.error));
  process.exit(1);
}
log("proposal reply:", JSON.stringify(prop).slice(0, 700));
const proposalId = prop.proposal?.id;
const ask = Number(prop.proposal?.ask_price);
log(`proposal id found: ${Boolean(proposalId)}, ask price: ${ask}`);

if (!doBuy) {
  log("Dry run: NO purchase made. Run `node trade.mjs buy` to buy once.");
  process.exit(0);
}
if (!proposalId || !(ask > 0) || ask > MAX_ASK) {
  log(`Not buying: missing id or ask price out of range (limit ${MAX_ASK}).`);
  process.exit(1);
}

log("buying ONCE...");
let buy;
try {
  buy = await request({ buy: proposalId, price: ask });
} catch {
  log("UNCERTAIN: no answer to the purchase. NOT retrying.");
  log("Check your DEMO account history on Deriv before doing anything else.");
  process.exit(1);
}
log("buy reply:", JSON.stringify(buy).slice(0, 700));
if (buy.error) { log("Purchase rejected:", JSON.stringify(buy.error)); process.exit(1); }
const contractId = Number(buy.buy?.contract_id);
if (!contractId) { log("No contract id found in reply. Check the raw reply above."); process.exit(1); }

log("watching contract", contractId, "until it settles (max 2 min)...");
const result = await new Promise((resolve) => {
  const giveUp = setTimeout(() => resolve(null), 120000);
  onPoc = (d) => {
    const c = d.proposal_open_contract;
    if (!c || Number(c.contract_id) !== contractId) return;
    if (c.is_sold || c.is_expired || c.status === "won" || c.status === "lost") {
      clearTimeout(giveUp);
      resolve(c);
    }
  };
  request({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 }).catch(() => {});
});
if (!result) {
  log("Contract not settled within 2 minutes. Check it on Deriv.");
} else {
     log("RESULT:", JSON.stringify(result));
}
const bal1 = await request({ balance: 1 });
log("balance after:", bal1.balance?.balance, bal1.balance?.currency);
process.exit(0);