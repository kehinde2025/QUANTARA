import "dotenv/config";

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
export const SESSION_COOKIE = "quantara_session";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_TEST = process.env.NODE_ENV === "test";

export const DERIV_API_BASE = process.env.DERIV_API_BASE ?? "https://api.derivws.com";
export const DERIV_APP_ID = process.env.DERIV_APP_ID ?? "";
export const DERIV_PUBLIC_WS_URL =
  process.env.DERIV_PUBLIC_WS_URL ?? "wss://api.derivws.com/trading/v1/options/ws/public";

  // Markets the platform watches for signals: a comma separated list of Deriv symbols.
export const SIGNAL_SYMBOLS = (process.env.SIGNAL_SYMBOLS ?? "R_10,R_25,R_50,R_75,R_100")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);