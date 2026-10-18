import { z } from "zod";
import { DERIV_API_BASE, DERIV_APP_ID } from "../config.js";

export type DerivAccount = {
  accountId: string;
  accountType: "demo" | "real";
  currency: string;
  balance: string;
  status: string;
};

export type ListAccountsResult =
  | { ok: true; accounts: DerivAccount[] }
  | { ok: false; reason: "invalid_token" | "unreachable" | "unexpected" | "not_configured" };

const accountsResponse = z.object({
  data: z.array(
    z.object({
      account_id: z.string(),
      account_type: z.string(),
      currency: z.string(),
      balance: z.union([z.string(), z.number()]),
      status: z.string(),
    }),
  ),
});

export async function listAccounts(token: string): Promise<ListAccountsResult> {
  if (!DERIV_APP_ID) return { ok: false, reason: "not_configured" };

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      headers: { Authorization: `Bearer ${token}`, "Deriv-App-ID": DERIV_APP_ID },
      signal: AbortSignal.timeout(10_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  // Deriv answers 401 both for a bad token and for a missing app ID, in plain text.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: text.includes("Deriv-App-ID") ? "not_configured" : "invalid_token" };
  }
  if (res.status >= 500) return { ok: false, reason: "unreachable" };
  if (!res.ok) return { ok: false, reason: "unexpected" };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unexpected" };
  }
  const parsed = accountsResponse.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "unexpected" };

  // Only demo and real trading accounts. Other kinds (e.g. wallets) can't trade.
  const accounts = parsed.data.data.flatMap((a) =>
    a.account_type === "demo" || a.account_type === "real"
      ? [
          {
            accountId: a.account_id,
            accountType: a.account_type,
            currency: a.currency,
            balance: String(a.balance),
            status: a.status,
          } satisfies DerivAccount,
        ]
      : [],
  );
  return { ok: true, accounts };
}