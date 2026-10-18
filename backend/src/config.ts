import "dotenv/config";

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
export const SESSION_COOKIE = "quantara_session";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_TEST = process.env.NODE_ENV === "test";

export const DERIV_API_BASE = process.env.DERIV_API_BASE ?? "https://api.derivws.com";
export const DERIV_APP_ID = process.env.DERIV_APP_ID ?? "";