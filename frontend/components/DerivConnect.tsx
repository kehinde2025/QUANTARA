"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  connectDeriv,
  disconnectDeriv,
  getConnection,
  getDerivAccounts,
  selectDerivAccount,
} from "@/lib/api";
import type { ConnectionInfo, DerivAccount } from "@/lib/api";
import { Card } from "@/components/ui";

type View = {
  connection: ConnectionInfo | null;
  accounts: DerivAccount[];
  selectedAccountId: string | null;
};

async function fetchView(): Promise<{ view?: View; error?: string }> {
  const conn = await getConnection();
  if (!conn.ok) return { error: conn.error };
  const connection = conn.data.connection;
  if (!connection) return { view: { connection: null, accounts: [], selectedAccountId: null } };

  const acc = await getDerivAccounts();
  if (acc.ok) {
    return {
      view: { connection, accounts: acc.data.accounts, selectedAccountId: acc.data.selectedAccountId },
    };
  }
  return {
    view: {
      connection: { ...connection, status: acc.status === 409 ? "invalid" : connection.status },
      accounts: [],
      selectedAccountId: connection.selectedAccountId,
    },
    error: acc.error,
  };
}

export default function DerivConnect() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchView().then((r) => {
      if (cancelled) return;
      setError(r.error ?? null);
      if (r.view) setView(r.view);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const r = await fetchView();
    setError(r.error ?? null);
    if (r.view) setView(r.view);
  }

  async function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await connectDeriv(token.trim());
    if (result.ok) {
      setToken("");
      await refresh();
      setNotice("Deriv connected. Your demo account is selected.");
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  async function onSelect(accountId: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await selectDerivAccount(accountId);
    if (result.ok) await refresh();
    else setError(result.error);
    setBusy(false);
  }

  async function onDisconnect() {
    if (!window.confirm("Disconnect your Deriv account from Quantara?")) return;
    setError(null);
    setBusy(true);
    const result = await disconnectDeriv();
    if (result.ok) {
      setView({ connection: null, accounts: [], selectedAccountId: null });
      setNotice(
        "Disconnected. Quantara deleted its copy of your token. Also delete the token on developers.deriv.com so it can no longer be used by anyone.",
      );
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-ink px-4 py-3 text-base text-white placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

  if (!view && !error) {
    return (
      <Card>
        <p className="text-muted">Loading...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p role="status" className="rounded-lg border border-gold/40 p-3 text-sm text-champagne">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-loss/40 p-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {view && !view.connection ? (
        <Card>
          <h2 className="text-lg font-medium text-white">Connect your Deriv account</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Open developers.deriv.com, go to the Dashboard, then API tokens.</li>
            <li>
              Create a token with the <span className="text-white">Trade</span> permission only. Leave
              Account management, Payments and Application insights unticked.
            </li>
            <li>Choose a short expiry. Deriv allows at most 90 days.</li>
            <li>Paste the token below.</li>
          </ol>
          <form onSubmit={onConnect} className="mt-4 space-y-3" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="deriv-token" className="text-sm text-muted">
                Deriv API token
              </label>
              <input
                id="deriv-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={input}
                placeholder="Paste your token"
              />
            </div>
            <button
              type="submit"
              disabled={busy || token.trim().length < 20}
              className="w-full rounded-lg bg-gold px-4 py-3 text-base font-semibold text-ink transition hover:bg-champagne disabled:opacity-60"
            >
              {busy ? "Checking with Deriv..." : "Connect Deriv"}
            </button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Quantara stores your token encrypted and never shows it again. Only demo accounts can be used
            for now. You can disconnect at any time.
          </p>
        </Card>
      ) : null}

      {view && view.connection ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-medium text-white">Deriv accounts</h2>
            <button
              onClick={onDisconnect}
              disabled={busy}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-muted hover:border-loss hover:text-loss disabled:opacity-60"
            >
              Disconnect
            </button>
          </div>

          {view.connection.status === "invalid" ? (
            <p className="mt-3 rounded-lg border border-loss/40 p-3 text-sm text-loss">
              Deriv rejected your saved token (it may have expired or been deleted). Disconnect, then
              connect again with a new token.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {view.accounts.map((a) => {
              const selected = a.accountId === view.selectedAccountId;
              const isDemo = a.accountType === "demo";
              return (
                <li key={a.accountId} className="rounded-lg border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-medium text-white">{a.accountId}</p>
                      <p className="text-sm text-muted">
                        {a.balance} {a.currency}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        isDemo ? "border-gold/40 text-gold" : "border-loss/40 text-loss"
                      }`}
                    >
                      {isDemo ? "Demo" : "Real"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm">
                    {selected ? (
                      <span className="text-gain">Selected account</span>
                    ) : isDemo ? (
                      <button
                        onClick={() => onSelect(a.accountId)}
                        disabled={busy}
                        className="text-gold hover:underline disabled:opacity-60"
                      >
                        Use this account
                      </button>
                    ) : (
                      <span className="text-muted">Real accounts are disabled for now.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}