// File: spike/accounts.mjs  (NEW FILE)
// Lists your Deriv Options accounts using the token in DERIV_TOKEN.
// Untested against the live API. Never prints the token.
const token = process.env.DERIV_TOKEN;
if (!token) {
  console.log("DERIV_TOKEN is not set in this PowerShell window.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };
if (process.env.DERIV_APP_ID) headers["Deriv-App-ID"] = process.env.DERIV_APP_ID;

const res = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers });
const body = await res.text();
console.log("Status:", res.status);
console.log(body.slice(0, 2000));