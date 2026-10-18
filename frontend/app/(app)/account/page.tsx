"use client";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { useUser } from "@/components/AppShell";

export default function AccountPage() {
  const user = useUser();
  return (
    <>
      <PageHeader title="Account" subtitle="Your profile and connected accounts" />
      <Card>
        <p className="text-sm text-muted">Email</p>
        <p className="mt-1 break-all">{user?.email}</p>
      </Card>
      <div className="mt-4">
        <EmptyState
          title="Connected Deriv accounts"
          body="Connecting your Deriv account, choosing between demo and real, and disconnecting will live here."
          stage="Stage 5"
        />
      </div>
    </>
  );
}