"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout, me } from "@/lib/api";
import type { User } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    me().then((result) => {
      if (cancelled) return;
      if (result.ok) setUser(result.data.user);
      else if (result.status === 401) router.replace("/login");
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gold">Quantara</h1>
        <button
          onClick={onLogout}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-muted hover:border-gold hover:text-white"
        >
          Log out
        </button>
      </header>

      <section className="mt-8 rounded-xl border border-white/10 bg-charcoal p-5">
        {error ? (
          <p role="alert" className="text-loss">
            {error}
          </p>
        ) : user ? (
          <>
            <p className="text-sm text-muted">Logged in as</p>
            <p className="mt-1 break-all text-lg">{user.email}</p>
            <p className="mt-4 text-sm text-muted">
              Dashboard coming soon. This page only proves the login works.
            </p>
          </>
        ) : (
          <p className="text-muted">Loading...</p>
        )}
      </section>
    </main>
  );
}