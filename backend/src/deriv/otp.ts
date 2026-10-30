import { z } from "zod";
import { DERIV_API_BASE, DERIV_APP_ID } from "../config.js";

export type OtpResult =
  | { ok: true; url: string }
  | { ok: false; reason: "auth_failed" | "unreachable" | "unexpected" | "not_configured" };

const otpReply = z.object({ data: z.object({ url: z.string() }) });

export type OtpRequest = {
  token: string;
  accountId: string;
  accountType: "demo" | "real";
  apiBase?: string;
  appId?: string;
  fetchImpl?: typeof fetch;
};

// Asks Deriv for a one-time pass and returns the ready-to-use socket address.
// The pass lasts 120 seconds and works once, so connect straight away.
// Nothing returned here ever contains the token.
export async function requestOtpUrl(req: OtpRequest): Promise<OtpResult> {
  const apiBase = req.apiBase ?? DERIV_API_BASE;
  const appId = req.appId ?? DERIV_APP_ID;
  if (!appId) return { ok: false, reason: "not_configured" };
  const doFetch = req.fetchImpl ?? fetch;

  let res: Response;
  let text: string;
  try {
    res = await doFetch(`${apiBase}/trading/v1/options/accounts/${encodeURIComponent(req.accountId)}/otp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.token}`,
        "Deriv-App-ID": appId,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  // Deriv answers 401 both for a bad token and for a missing app ID, in plain text.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: text.includes("Deriv-App-ID") ? "not_configured" : "auth_failed" };
  }
  if (res.status >= 500) return { ok: false, reason: "unreachable" };
  if (!res.ok) return { ok: false, reason: "unexpected" };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unexpected" };
  }
  const parsed = otpReply.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "unexpected" };

  // Only connect to a secure socket on Deriv's own host, and only to the kind
  // of account that was asked for: a demo request must never get a real socket.
  let socket: URL;
  try {
    socket = new URL(parsed.data.data.url);
  } catch {
    return { ok: false, reason: "unexpected" };
  }
  if (socket.protocol !== "wss:") return { ok: false, reason: "unexpected" };
  if (socket.host !== new URL(apiBase).host) return { ok: false, reason: "unexpected" };
  if (!socket.pathname.endsWith(`/ws/${req.accountType}`)) return { ok: false, reason: "unexpected" };

  return { ok: true, url: parsed.data.data.url };
}