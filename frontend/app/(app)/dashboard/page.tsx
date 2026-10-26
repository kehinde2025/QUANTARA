"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getConnection, getDerivAccounts } from "@/lib/api";
import type { DerivAccount } from "@/lib/api";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { useUser } from "@/components/AppShell";

type Summary =
  | { state: "loading" }
  | { state: "none" }
  | { state: "invalid" }
  | { state: "error"; message: string }
  | { state: "ok"; selected: DerivAccount | null };

async function loadSummary(): Promise<Summary> {
  const conn = await getConnection();
  if (!conn.ok) return { state: "error", message: conn.error };
  if (!conn.data.connection) return { state: "none" };

  const acc = await getDerivAccounts();
  if (acc.ok) {
    const selected = acc.data.accounts.find((a) => a.accountId === acc.data.selectedAccountId) ?? null;
    return { state: "ok", selected };
  }
  if (acc.status === 409) return { state: "invalid" };
  return { state: "error", message: acc.error };
}

export default function DashboardPage() {
  const user = useUser();
  const [summary, setSummary] = useState<Summary>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadSummary().then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = summary.state === "ok" ? summary.selected : null;

  const connectionValue =
    summary.state === "ok"
      ? "Connected"
      : summary.state === "none"
        ? "Not connected"
        : summary.state === "invalid"
          ? "Needs attention"
          : summary.state === "error"
            ? "Unavailable"
            : "Checking...";

  const connectionNote =
    summary.state === "invalid"
      ? "Deriv rejected your token"
      : summary.state === "error"
        ? summary.message
        : summary.state === "ok" && !selected
          ? "No account selected"
          : undefined;

  const showConnectLink = summary.state === "none" || summary.state === "invalid";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={user ? `Signed in as ${user.email}` : undefined} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Deriv account" value={connectionValue} note={connectionNote} />
        <StatCard
          label={selected ? `${selected.accountType === "demo" ? "Demo" : "Real"} balance` : "Balance"}
          value={selected ? `${selected.balance} ${selected.currency}` : "-"}
          note={selected ? `Account ${selected.accountId}` : "Needs a connected account"}
        />
        <StatCard label="Active bots" value="-" note="Bots arrive in Stage 10" />
        <StatCard label="Today's profit or loss" value="-" note="Needs trading history" />
      </div>

      {showConnectLink ? (
        <Card className="mt-4">
          <p className="text-sm text-muted">
            {summary.state === "invalid"
              ? "Your saved Deriv token no longer works."
              : "Connect your Deriv account to see your balance."}
          </p>
          <Link
            href="/account"
            className="mt-3 inline-block rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-champagne"
          >
            {summary.state === "invalid" ? "Fix connection" : "Connect Deriv"}
          </Link>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="font-medium text-white">Signals</h2>
          <p className="mt-2 text-sm text-muted">
            Ideas from simple rules on live prices. Information only; nothing is traded from them.
          </p>
          <Link href="/signals" className="mt-3 inline-block text-sm text-gold hover:underline">
            View signals
          </Link>
        </Card>
        <EmptyState
          title="Recent activity"
          body="Your trades and contract results will appear here. Nothing is shown until real trades exist."
          stage="Stage 8"
        />
      </div>

      <Card className="mt-4">
        <p className="text-sm text-muted">
          Trading involves risk. Quantara does not guarantee profits, win rates or risk-free trading.
        </p>
      </Card>
    </>
  );
}