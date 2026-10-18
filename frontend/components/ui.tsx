import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-charcoal p-4 sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </Card>
  );
}

// For screens whose backend does not exist yet. Always says so plainly.
export function EmptyState({ title, body, stage }: { title: string; body: string; stage: string }) {
  return (
    <Card className="text-center">
      <span className="inline-block rounded-full border border-gold/40 px-3 py-1 text-xs text-gold">
        Placeholder, {stage}
      </span>
      <h2 className="mt-4 text-lg font-medium text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </Card>
  );
}