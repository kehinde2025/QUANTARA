// File: spike/stayalive2.mjs  (REPLACE ENTIRE FILE)
// Demo account only, NO trades. Reconnects automatically after any drop.
// On each drop it logs how long it had been since Deriv last replied,
// to help tell "network died" apart from "Deriv cut a healthy connection".
// Untested: expect surprises.
const token = process.env.DERIV_TOKEN;
const appId = process.env.DERIV_APP_ID;
if (!token || !appId) {
  console.log("Set DERIV_TOKEN and DERIV_APP_ID in this window first.");
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${token}`,
  "Deriv-App-ID": appId,
  "Content-Type": "application/json",
};
const base = "https://api.derivws.com/trading/v1/options";
const stamp = () => new Date().toISOString().slice(11, 19);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getDemoUrl() {
  const acc = await (await fetch(`${base}/accounts`, { headers })).json();
  const demo = (acc.data ?? []).find((a) => a.account_type === "demo");
  if (!demo) throw new Error("no demo account found");
  const res = await fetch(`${base}/accounts/${demo.account_id}/otp`, { method: "POST", headers });
  const url = (await res.text()).match(/wss:\/\/[^"\s]+/)?.[0];
  if (!url || !url.includes("/ws/demo")) throw new Error(`no demo URL (status ${res.status})`);
  return url;
}

function runOnce(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mins = () => ((Date.now() - start) / 60000).toFixed(1);
    const ws = new WebSocket(url);
    let pongs = 0;
    let lastReply = Date.now();
    let pingTimer, logTimer;

    ws.onopen = () => {
      console.log(`[${stamp()}] connected`);
      ws.send(JSON.stringify({ balance: 1 }));
      pingTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ ping: 1 }));
        } catch {}
      }, 30000);
      logTimer = setInterval(
        () => console.log(`[${stamp()}] up ${mins()} min, ${pongs} pongs`),
        300000
      );
    };

    ws.onmessage = (e) => {
      lastReply = Date.now();
      const d = JSON.parse(e.data);
      if (d.msg_type === "ping" || d.ping || d.pong) pongs++;
    };

    ws.onclose = (e) => {
      clearInterval(pingTimer);
      clearInterval(logTimer);
      const quiet = ((Date.now() - lastReply) / 1000).toFixed(0);
      console.log(
        `[${stamp()}] CLOSED after ${mins()} min, code=${e.code}, ` +
          `reason=${e.reason || "(none)"}, last reply from Deriv ${quiet}s before the drop`
      );
      resolve();
    };

    ws.onerror = () => {};
  });
}

while (true) {
  try {
    await runOnce(await getDemoUrl());
  } catch (err) {
    console.log(`[${stamp()}] problem: ${err.message}`);
  }
  console.log(`[${stamp()}] waiting 10s, then reconnecting with a fresh pass`);
  await sleep(10000);
}