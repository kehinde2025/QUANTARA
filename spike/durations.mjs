// File: spike/durations.mjs  (NEW FILE)
// Lists every CALL entry for R_100 with its expiry type and duration range.
const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");

ws.onopen = () => ws.send(JSON.stringify({ contracts_for: "R_100" }));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.error) {
    console.log("API error:", JSON.stringify(data.error));
    ws.close();
    return;
  }
  const rows = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (node.contract_type === "CALL") {
        rows.push(`${node.expiry_type}: ${node.min_contract_duration} to ${node.max_contract_duration}`);
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(data);
  console.log("CALL entries:\n" + rows.join("\n"));
  ws.close();
};

ws.onerror = (e) => console.log("Connection error:", e.message ?? e);