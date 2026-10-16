// File: spike/ticks.mjs  (NEW FILE)
// Connects to Deriv's public feed (no login) and prints 5 live prices.
// Not yet tested against the live API, so an error here is useful information.
const ws = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
let count = 0;

ws.onopen = () => {
  console.log("Connected");
  ws.send(JSON.stringify({ ticks: "R_100", subscribe: 1 }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.error) {
    console.log("API error:", data.error);
    ws.close();
    return;
  }
  if (data.tick) {
    console.log("R_100 price:", data.tick.quote);
    if (++count >= 5) ws.close();
  }
};

ws.onerror = (e) => console.log("Connection error:", e.message ?? e);
ws.onclose = () => console.log("Closed");