"use client";

import { useEffect, useMemo, useState } from "react";
import { getHistory, getSymbols, openPriceStream } from "@/lib/api";
import type { MarketState, PricePoint, SymbolInfo } from "@/lib/api";
import PriceChart from "@/components/PriceChart";
import ContractTypes from "@/components/ContractTypes";
import { Card } from "@/components/ui";

const MAX_POINTS = 600;
// The server sends a state update every 3 seconds. Silence for longer than
// this means the link between this page and Quantara is broken.
const SILENT_AFTER_MS = 9_000;

type Tone = "live" | "stale" | "down";

const TONE_CLASS: Record<Tone, string> = {
    live: "border-gain/40 text-gain",
    stale: "border-gold/40 text-gold",
    down: "border-loss/40 text-loss",
};

function mergeHistory(history: PricePoint[], live: PricePoint[]): PricePoint[] {
    const byEpoch = new Map<number, PricePoint>();
    for (const p of history) byEpoch.set(p.epoch, p);
    for (const p of live) byEpoch.set(p.epoch, p);
    const merged = [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch);
    return merged.length > MAX_POINTS ? merged.slice(merged.length - MAX_POINTS) : merged;
}

function seconds(ms: number) {
    return Math.max(0, Math.round(ms / 1000));
}

// Remounted for every market (see the key below), so its state starts empty.
function LivePrice({ symbol, info }: { symbol: string; info: SymbolInfo | undefined }) {
    const [points, setPoints] = useState<PricePoint[]>([]);
    const [decimals, setDecimals] = useState(2);
    const [state, setState] = useState<MarketState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [streamError, setStreamError] = useState<"reconnecting" | "closed" | null>(null);
    const [lastEventAt, setLastEventAt] = useState<number | null>(null);
    const [now, setNow] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const es = openPriceStream(symbol);

        es.onopen = () => {
            if (!cancelled) setStreamError(null);
        };
        es.onerror = () => {
            if (!cancelled) setStreamError(es.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
        };
        es.addEventListener("state", (e) => {
            if (cancelled) return;
            try {
                setState(JSON.parse((e as MessageEvent<string>).data) as MarketState);
            } catch {
                return;
            }
            const t = Date.now();
            setLastEventAt(t);
            setNow(t);
        });
        es.addEventListener("tick", (e) => {
            if (cancelled) return;
            let tick: { quote: number; epoch: number; decimals: number };
            try {
                tick = JSON.parse((e as MessageEvent<string>).data);
            } catch {
                return;
            }
            setDecimals(tick.decimals);
            setPoints((prev) => {
                const last = prev[prev.length - 1];
                if (last && tick.epoch <= last.epoch) return prev;
                const next = [...prev, { epoch: tick.epoch, quote: tick.quote }];
                return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
            });
            const t = Date.now();
            setLastEventAt(t);
            setNow(t);
        });

        getHistory(symbol, 300).then((r) => {
            if (cancelled) return;
            if (!r.ok) {
                setError(r.error);
                return;
            }
            setDecimals(r.data.decimals);
            setPoints((prev) => mergeHistory(r.data.ticks, prev));
        });

        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            cancelled = true;
            es.close();
            clearInterval(timer);
        };
    }, [symbol]);

    const silent = lastEventAt !== null && now - lastEventAt > SILENT_AFTER_MS;
    const latest = points[points.length - 1];

    let status: { label: string; tone: Tone; detail: string };
    if (streamError === "closed") {
        status = { label: "Connection closed", tone: "down", detail: "Refresh the page to reconnect." };
    } else if (streamError === "reconnecting" || silent) {
        status = {
            label: "Connection lost",
            tone: "down",
            detail: "Reconnecting to Quantara. The price below is not live.",
        };
    } else if (!state) {
        status = { label: "Connecting", tone: "stale", detail: "Waiting for the first update." };
    } else if (state.feed !== "open") {
        status = {
            label: "Market data offline",
            tone: "down",
            detail: "Quantara lost its connection to Deriv's price feed. The price below is not live.",
        };
    } else if (state.stale) {
        status = {
            label: info?.exchangeIsOpen === false ? "Market closed" : "No recent price",
            tone: "stale",
            detail:
                state.ageMs === null
                    ? "No live price received yet. The price below is the last known price."
                    : `Last live price was ${seconds(state.ageMs)} seconds ago. The price below is the last known price.`,
        };
    } else {
        status = {
            label: "Live",
            tone: "live",
            detail: state.ageMs === null ? "Live" : `Updated ${seconds(state.ageMs)} seconds ago.`,
        };
    }

    const marketLine = info
        ? `${info.market.replace(/_/g, " ")} / ${info.submarket.replace(/_/g, " ")}${info.tradingSuspended ? " / trading suspended" : ""
        }`
        : "";

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-medium text-white">{info?.name ?? symbol}</h2>
                    <p className="text-xs text-muted">{marketLine}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${TONE_CLASS[status.tone]}`}>
                    {status.label}
                </span>
            </div>

            <p
                className={`mt-4 text-4xl font-semibold tabular-nums ${status.tone === "live" ? "text-white" : "text-muted"
                    }`}
            >
                {latest ? latest.quote.toFixed(decimals) : "-"}
            </p>
            <p className="mt-1 text-sm text-muted">{status.detail}</p>

            {error ? (
                <p role="alert" className="mt-3 text-sm text-loss">
                    {error}
                </p>
            ) : null}

            <div className="mt-4">
                <PriceChart points={points} decimals={decimals} live={status.tone === "live"} />
            </div>
        </Card>
    );
}

export default function MarketsView() {
    const [symbols, setSymbols] = useState<SymbolInfo[] | null>(null);
    const [symbolsError, setSymbolsError] = useState<string | null>(null);
    const [selected, setSelected] = useState("R_100");

    useEffect(() => {
        let cancelled = false;
        getSymbols().then((r) => {
            if (cancelled) return;
            if (!r.ok) {
                setSymbolsError(r.error);
                return;
            }
            setSymbols(r.data.symbols);
            setSymbolsError(null);
            const first = r.data.symbols[0];
            if (first && !r.data.symbols.some((s) => s.symbol === "R_100")) setSelected(first.symbol);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const groups = useMemo(() => {
        const byMarket = new Map<string, SymbolInfo[]>();
        for (const s of symbols ?? []) {
            const list = byMarket.get(s.market) ?? [];
            list.push(s);
            byMarket.set(s.market, list);
        }
        return [...byMarket.entries()];
    }, [symbols]);

    const info = symbols?.find((s) => s.symbol === selected);

    return (
        <div className="space-y-4">
            <Card>
                <label htmlFor="market" className="text-sm text-muted">
                    Market
                </label>
                {symbolsError ? (
                    <p role="alert" className="mt-2 text-sm text-loss">
                        {symbolsError}
                    </p>
                ) : !symbols ? (
                    <p className="mt-2 text-muted">Loading markets...</p>
                ) : (
                    <select
                        id="market"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink px-4 py-3 text-base text-white focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                    >
                        {groups.map(([market, list]) => (
                            <optgroup key={market} label={market.replace(/_/g, " ")}>
                                {list.map((s) => (
                                    <option key={s.symbol} value={s.symbol}>
                                        {s.name}
                                        {s.tradingSuspended ? " (suspended)" : ""}
                                        {!s.exchangeIsOpen ? " (closed)" : ""}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                )}
            </Card>

            {symbols ? <LivePrice key={`price-${selected}`} symbol={selected} info={info} /> : null}
                  {symbols ? <ContractTypes key={`contracts-${selected}`} symbol={selected} /> : null} </div>
    );
}