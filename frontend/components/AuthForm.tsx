"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { login, register } from "@/lib/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (isRegister && password.length < 10) {
      setError("Use a password of at least 10 characters.");
      return;
    }
    setBusy(true);
    const result = isRegister ? await register(email, password) : await login(email, password);
    if (result.ok) {
      router.push("/dashboard");
      return;
    }
    setBusy(false);
    setError(
      result.status === 400
        ? "Check your email address and password (10 characters or more)."
        : result.error,
    );
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-charcoal px-4 py-3 text-base text-white placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          placeholder={isRegister ? "At least 10 characters" : "Your password"}
        />
      </div>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-loss">
        {error}
      </p>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-gold px-4 py-3 text-base font-semibold text-ink transition hover:bg-champagne disabled:opacity-60"
      >
        {busy ? "Please wait..." : isRegister ? "Create account" : "Log in"}
      </button>

      <p className="text-center text-sm text-muted">
        {isRegister ? "Already have an account? " : "New to Quantara? "}
        <Link href={isRegister ? "/login" : "/register"} className="text-gold hover:underline">
          {isRegister ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}