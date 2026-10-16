// File: spike/contracts.mjs  (REPLACE ENTIRE FILE)
// Lists the contract types Deriv offers for R_100 on the public feed.
// Untested: if request A is rejected we try request B.
const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");

const attempts = [
  { contracts_for: "R_100" },
  { contracts_for: 1, underlying_symbol: "R_100" },
];
let i = 0;

ws.onopen = () => ws.send(JSON.stringify(attempts[i]));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.error) {
    console.log(`Attempt ${i + 1} rejected:`, JSON.stringify(data.error));
    if (++i < attempts.length) {
      ws.send(JSON.stringify(attempts[i]));
      return;
    }
    ws.close();
    return;
  }
  const text = JSON.stringify(data);
  const types = [...new Set([...text.matchAll(/"contract_type":"([A-Z_]+)"/g)].map((m) => m[1]))];
  console.log(`Attempt ${i + 1} worked. Contract types found:`, types.join(", ") || "(none matched)");
  if (!types.length) console.log(text.slice(0, 1500));
  ws.close();
};

ws.onerror = (e) => console.log("Connection error:", e.message ?? e);