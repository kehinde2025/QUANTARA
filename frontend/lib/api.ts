const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type User = { id: string; email: string; role?: string };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = typeof body?.error === "string" ? body.error : "Something went wrong";
      return { ok: false, status: res.status, error };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Can't reach the server. Check your connection and try again.",
    };
  }
}

export const register = (email: string, password: string) =>
  call<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const login = (email: string, password: string) =>
  call<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const logout = () => call<void>("/auth/logout", { method: "POST" });

export const me = () => call<{ user: User }>("/auth/me");

// ---- Deriv connection ----

export type DerivAccount = {
  accountId: string;
  accountType: "demo" | "real";
  currency: string;
  balance: string;
  status: string;
};

export type ConnectionInfo = {
  status: "active" | "invalid";
  selectedAccountId: string | null;
  lastVerifiedAt: string | null;
};

export const getConnection = () => call<{ connection: ConnectionInfo | null }>("/deriv/connection");

export const getDerivAccounts = () =>
  call<{ accounts: DerivAccount[]; selectedAccountId: string | null }>("/deriv/accounts");

export const connectDeriv = (token: string) =>
  call<{ accounts: DerivAccount[]; selectedAccountId: string | null }>("/deriv/connect", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const selectDerivAccount = (accountId: string) =>
  call<{ selectedAccountId: string }>("/deriv/select", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });

export const disconnectDeriv = () => call<void>("/deriv/connection", { method: "DELETE" });

// ---- Market data ----

export type FeedStatus = "connecting" | "open" | "closed";

export type SymbolInfo = {
  symbol: string;
  name: string;
  market: string;
  submarket: string;
  type: string;
  exchangeIsOpen: boolean;
  tradingSuspended: boolean;
};

export type PricePoint = { epoch: number; quote: number };

export type HistoryResponse = {
  symbol: string;
  decimals: number;
  ticks: PricePoint[];
  stale: boolean;
  feed: FeedStatus;
};

export type MarketState = {
  feed: FeedStatus;
  silentForMs: number | null;
  latest: { quote: number; epoch: number; decimals: number } | null;
  ageMs: number | null;
  stale: boolean;
};

export const getSymbols = () => call<{ symbols: SymbolInfo[] }>("/market/symbols");

export const getHistory = (symbol: string, count = 300) =>
  call<HistoryResponse>(`/market/history?symbol=${encodeURIComponent(symbol)}&count=${count}`);

// Live prices. The browser keeps the login cookie; no Deriv credential is involved.
export function openPriceStream(symbol: string): EventSource {
  return new EventSource(`${API_URL}/market/stream?symbol=${encodeURIComponent(symbol)}`, {
    withCredentials: true,
  });
}

// ---- Contract types per market ----

export type ContractTypeSummary = {
  contractType: string;
  category: string;
  sentiment: string | null;
  barriers: number | null;
  durations: { expiryType: string; min: string; max: string }[];
  growthRates: number[] | null;
  lastDigits: number[] | null;
};

export const getContractTypes = (symbol: string) =>
  call<{ symbol: string; contracts: ContractTypeSummary[] }>(
    `/market/contracts?symbol=${encodeURIComponent(symbol)}`,
  );


// ---- Signals ----

export type SignalView = {
  id: string;
  strategy: string;
  symbol: string;
  direction: "rise" | "fall";
  contractType: string;
  timeframeSeconds: number;
  reason: string;
  details: Record<string, number>;
  status: "new" | "valid" | "executed" | "expired" | "cancelled" | "rejected" | "failed";
  createdAt: string;
  expiresAt: string;
};

export const getSignals = (limit = 50) => call<{ signals: SignalView[] }>(`/signals?limit=${limit}`);