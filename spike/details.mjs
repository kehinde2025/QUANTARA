// File: spike/details.mjs  (NEW FILE)
// Prints the raw Deriv listing for ACCU, DIGITDIFF and CALL on R_100.
// Untested: I don't know the exact field names, so we print raw data.
const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");

ws.onopen = () => ws.send(JSON.stringify({ contracts_for: "R_100" }));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.error) {
    console.log("API error:", JSON.stringify(data.error));
    ws.close();
    return;
  }
  const found = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const t = node.contract_type;
      if (["ACCU", "DIGITDIFF", "CALL"].includes(t) && !found[t]) found[t] = node;
      Object.values(node).forEach(walk);
    }
  };
  walk(data);
  for (const [type, entry] of Object.entries(found)) {
    console.log(`\n=== ${type} ===\n` + JSON.stringify(entry, null, 1).slice(0, 1200));
  }
  ws.close();
};

ws.onerror = (e) => console.log("Connection error:", e.message ?? e);