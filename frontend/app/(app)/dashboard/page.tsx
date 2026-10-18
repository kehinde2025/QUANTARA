"use client";

import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function DashboardPage() {
  const user = useUser();
  return (
    <>
      <PageHeader title="Dashboard" subtitle={user ? `Signed in as ${user.email}` : undefined} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Deriv account" value="Not connected" note="Connect in Stage 5" />
        <StatCard label="Balance" value="-" note="Needs a connected account" />
        <StatCard label="Active bots" value="-" note="Bots arrive in Stage 10" />
        <StatCard label="Today's profit or loss" value="-" note="Needs trading history" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <EmptyState
          title="Recent signals"
          body="Signals will appear here once the strategy engine is built. Nothing is shown until real signals exist."
          stage="Stage 7"
        />
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