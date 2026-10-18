import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-4xl font-semibold text-gold">Quantara</h1>
      <p className="mb-10 mt-2 text-muted">Intelligence in Every Trade.</p>
      <div className="space-y-3">
        <Link
          href="/register"
          className="block rounded-lg bg-gold px-4 py-3 font-semibold text-ink hover:bg-champagne"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="block rounded-lg border border-white/10 px-4 py-3 text-white hover:border-gold"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}