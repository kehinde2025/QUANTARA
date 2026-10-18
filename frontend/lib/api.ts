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