"use client";

import { useEffect, useState } from "react";
import { getContractTypes } from "@/lib/api";
import type { ContractTypeSummary } from "@/lib/api";
import { Card } from "@/components/ui";

const LABELS: Record<string, string> = {
    CALL: "Rise",
    PUT: "Fall",
    ACCU: "Accumulator",
    DIGITDIFF: "Digit Differs",
    DIGITMATCH: "Digit Matches",
    DIGITOVER: "Digit Over",
    DIGITUNDER: "Digit Under",
    DIGITEVEN: "Digit Even",
    DIGITODD: "Digit Odd",
};

const DIGIT_TYPES = ["DIGITDIFF", "DIGITMATCH", "DIGITOVER", "DIGITUNDER", "DIGITEVEN", "DIGITODD"];

type Bot = { name: string; types: string[]; need: "all" | "any" };

const BOTS: Bot[] = [
    { name: "Rise/Fall Bot", types: ["CALL", "PUT"], need: "all" },
    { name: "Accumulator Bot", types: ["ACCU"], need: "all" },
    { name: "Digit AI Bot", types: DIGIT_TYPES, need: "any" },
];

type State = "available" | "partial" | "none";

const BADGE: Record<State, string> = {
    available: "border-gain/40 text-gain",
    partial: "border-gold/40 text-gold",
    none: "border-white/10 text-muted",
};
const BADGE_TEXT: Record<State, string> = {
    available: "Available",
    partial: "Partly available",
    none: "Not available",
};

const label = (type: string) => LABELS[type] ?? type;
const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

function durationText(c: ContractTypeSummary | undefined): string {
    if (!c || c.durations.length === 0) return "";
    return c.durations
        .map((d) =>
            d.expiryType === "no_expiry"
                ? "no fixed expiry"
                : d.min === d.max
                    ? `${d.expiryType} ${d.min}`
                    : `${d.expiryType} ${d.min} to ${d.max}`,
        )
        .join(", ");
}

function status(byType: Map<string, ContractTypeSummary>, bot: Bot) {
    const present = bot.types.filter((t) => byType.has(t));
    const missing = bot.types.filter((t) => !byType.has(t));
    const state: State =
        present.length === 0
            ? "none"
            : bot.need === "all"
                ? missing.length === 0
                    ? "available"
                    : "partial"
                : "available";
    return { present, missing, state };
}

function detail(bot: Bot, s: ReturnType<typeof status>, byType: Map<string, ContractTypeSummary>): string {
    if (s.state === "none") return "Not listed for this market right now.";
    if (s.state === "partial") {
        return `Only ${s.present.map(label).join(", ")} is listed. Missing: ${s.missing.map(label).join(", ")}.`;
    }
    if (bot.need === "any") {
        return `${s.present.length} of ${bot.types.length} types listed: ${s.present.map(label).join(", ")}.`;
    }
    const first = byType.get(bot.types[0]!);
    const parts = [durationText(first)];
    if (first?.growthRates) parts.push(`growth rates ${first.growthRates.map(percent).join(", ")}`);
    const text = parts.filter(Boolean).join("; ");
    return text ? `${text}.` : "Listed by Deriv.";
}

// Remounted for every market (see the key in MarketsView), so state starts empty.
export default function ContractTypes({ symbol }: { symbol: string }) {
    const [contracts, setContracts] = useState<ContractTypeSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getContractTypes(symbol).then((r) => {
            if (cancelled) return;
            if (r.ok) setContracts(r.data.contracts);
            else setError(r.error);
        });
        return () => {
            cancelled = true;
        };
    }, [symbol]);

    if (error) {
        return (
            <Card>
                <p role="alert" className="text-sm text-loss">
                    {error}
                </p>
            </Card>
        );
    }
    if (!contracts) {
        return (
            <Card>
                <p className="text-sm text-muted">Loading contract types...</p>
            </Card>
        );
    }

    const byType = new Map(contracts.map((c) => [c.contractType, c]));
    const categories = [...new Set(contracts.map((c) => c.category))];

    return (
        <div className="space-y-4">
            <Card>
                <h2 className="font-medium text-white">Quantara bots on this market</h2>
                <ul className="mt-3 space-y-3">
                    {BOTS.map((bot) => {
                        const s = status(byType, bot);
                        return (
                            <li key={bot.name} className="rounded-lg border border-white/10 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium text-white">{bot.name}</p>
                                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${BADGE[s.state]}`}>
                                        {BADGE_TEXT[s.state]}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm text-muted">{detail(bot, s, byType)}</p>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 text-xs text-muted">
                    This is what Deriv lists for this market right now. A listed contract does not mean your
                    account may trade it; that is checked again before any trade.
                </p>
            </Card>

            <Card>
                {contracts.length === 0 ? (
                    <p className="text-sm text-muted">Deriv lists no contracts for this market right now.</p>
                ) : (
                    <details>
                        <summary className="cursor-pointer text-sm text-gold">
                            Show all {contracts.length} contract types Deriv lists
                        </summary>
                        <div className="mt-3 space-y-4">
                            {categories.map((category) => (
                                <div key={category}>
                                    <h3 className="text-xs uppercase tracking-wide text-muted">{category}</h3>
                                    <ul className="mt-1.5 space-y-1.5">
                                        {contracts
                                            .filter((c) => c.category === category)
                                            .map((c) => (
                                                <li key={c.contractType} className="text-sm">
                                                    <span className="text-white">{label(c.contractType)}</span>
                                                    {label(c.contractType) !== c.contractType ? (
                                                        <span className="text-muted"> ({c.contractType})</span>
                                                    ) : null}
                                                    {durationText(c) ? <span className="text-muted">: {durationText(c)}</span> : null}
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </Card>
        </div>
    );
}