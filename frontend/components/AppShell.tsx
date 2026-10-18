"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { logout, me } from "@/lib/api";
import type { User } from "@/lib/api";

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

const icons: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  markets: <polyline points="3 17 9 11 13 15 21 7" />,
  bots: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
    </>
  ),
  signals: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", mobile: true },
  { href: "/markets", label: "Markets", icon: "markets", mobile: true },
  { href: "/bots", label: "Bots", icon: "bots", mobile: true },
  { href: "/signals", label: "Signals", icon: "signals", mobile: false },
  { href: "/activity", label: "Activity", icon: "activity", mobile: true },
  { href: "/account", label: "Account", icon: "account", mobile: true },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <p role="alert" className="text-loss">
          {error}
        </p>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-dvh lg:flex">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-white/10 bg-charcoal transition-all lg:flex ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          <div className="flex h-14 items-center justify-between px-4">
            {collapsed ? null : <span className="text-lg font-semibold text-gold">Quantara</span>}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="rounded-md px-2 py-1 text-muted hover:text-white"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? ">" : "<"}
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active(item.href)
                    ? "bg-white/5 text-gold"
                    : "text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon name={item.icon} />
                {collapsed ? null : item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            {collapsed ? null : <p className="mb-2 truncate text-xs text-muted">{user.email}</p>}
            <button
              onClick={onLogout}
              className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-muted hover:border-gold hover:text-white"
            >
              {collapsed ? "Out" : "Log out"}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-4 lg:hidden">
            <span className="text-lg font-semibold text-gold">Quantara</span>
            <button onClick={onLogout} className="text-sm text-muted hover:text-white">
              Log out
            </button>
          </header>

          <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 lg:px-8 lg:pb-8">{children}</main>
        </div>

        {/* Mobile bottom navigation */}
        <nav
          className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-charcoal pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Main"
        >
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => n.mobile).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                    active(item.href) ? "text-gold" : "text-muted"
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </UserContext.Provider>
  );
}