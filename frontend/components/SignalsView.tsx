"use client";

import { useEffect, useState } from "react";
import { getSignals } from "@/lib/api";
import type { SignalView } from "@/lib/api";
import { Card } from "@/components/ui";

const STRATEGY_LABEL: Record<string, string> = {
  ema_cross: "EMA cross",
  rsi_reversal: "RSI reversal",
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function SignalsView() {
  const [signals, setSignals] = useState<SignalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getSignals().then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setSignals(r.data.signals);
          setError(null);
        } else {
          setError(r.error);
        }
      });
    load();
    const poll = setInterval(load, 5000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clockTimer);
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted">
          These are ideas from simple rules applied to finished 1-minute candles. They are information
          only: nothing here trades, and no idea is a guaranteed prediction. Each one is valid for 60
          seconds.
        </p>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg border border-loss/40 p-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {!signals && !error ? (
        <Card>
          <p className="text-muted">Loading signals...</p>
        </Card>
      ) : null}

      {signals && signals.length === 0 ? (
        <Card>
          <h2 className="font-medium text-white">No signals yet</h2>
          <p className="mt-2 text-sm text-muted">
            A signal appears when a rule fires on a finished 1-minute candle. That can take a while,
            and only happens while the Quantara server is running. Nothing is shown until a real signal
            exists.
          </p>
        </Card>
      ) : null}

      {signals && signals.length > 0 ? (
        <ul className="space-y-3">
          {signals.map((s) => {
            const remaining = now === 0 ? null : Math.round((Date.parse(s.expiresAt) - now) / 1000);
            const status = s.status === "valid" && remaining !== null && remaining <= 0 ? "expired" : s.status;
            const valid = status === "valid";
            return (
              <li key={s.id} className="rounded-xl border border-white/10 bg-charcoal p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{s.symbol}</p>
                    <p className="text-xs text-muted">
                      {STRATEGY_LABEL[s.strategy] ?? s.strategy} / {clock(s.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${
                      valid ? "border-gold/40 text-gold" : "border-white/10 text-muted"
                    }`}
                  >
                    {capitalise(status)}
                  </span>
                </div>

                <p className={`mt-3 text-lg ${valid ? "text-champagne" : "text-muted"}`}>
                  {s.direction === "rise" ? "Rise \u2191" : "Fall \u2193"}{" "}
                  <span className="text-sm text-muted">({s.contractType})</span>
                </p>
                <p className="mt-1 text-sm text-muted">{s.reason}</p>
                {valid && remaining !== null ? (
                  <p className="mt-1 text-xs text-gold">Valid for {remaining} more seconds</p>
                ) : null}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gold">Show the numbers</summary>
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(s.details).map(([key, value]) => (
                      <li key={key} className="text-xs text-muted">
                        {key}: {value.toFixed(4)}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}