"use client";

import { useMemo } from "react";
import type { PricePoint } from "@/lib/api";

const W = 600;
const H = 300;
const PAD_L = 8;
const PAD_R = 72;
const PAD_T = 12;
const PAD_B = 26;

function clock(epoch: number) {
  return new Date(epoch * 1000).toLocaleTimeString([], { hour12: false });
}

export default function PriceChart({
  points,
  decimals,
  live,
}: {
  points: PricePoint[];
  decimals: number;
  live: boolean;
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.quote < min) min = p.quote;
      if (p.quote > max) max = p.quote;
    }
    if (max === min) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;

    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const x = (t: number) => PAD_L + (last.epoch === first.epoch ? 0 : ((t - first.epoch) / (last.epoch - first.epoch)) * innerW);
    const y = (q: number) => PAD_T + (1 - (q - min) / (max - min)) * innerH;
    const line = points.map((p) => `${x(p.epoch).toFixed(1)},${y(p.quote).toFixed(1)}`).join(" ");

    return { first, last, min, max, line, y, lastX: x(last.epoch), lastY: y(last.quote) };
  }, [points]);

  if (!geometry) {
    return (
      <div className="grid aspect-[2/1] place-items-center rounded-lg border border-white/10 text-sm text-muted">
        Waiting for prices...
      </div>
    );
  }

  const { first, last, min, max, line, y, lastX, lastY } = geometry;
  const levels = [max, (max + min) / 2, min];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={live ? "Live price chart" : "Price chart, not live"}
    >
      {levels.map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(v)}
            y2={y(v)}
            className="stroke-white/10"
            strokeWidth="1"
          />
          <text x={W - PAD_R + 6} y={y(v) + 4} className="fill-muted" fontSize="12">
            {v.toFixed(decimals)}
          </text>
        </g>
      ))}

      <polyline
        points={line}
        fill="none"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={live ? "stroke-gold" : "stroke-muted"}
      />
      <circle cx={lastX} cy={lastY} r="3.5" className={live ? "fill-gold" : "fill-muted"} />

      <text x={PAD_L} y={H - 8} className="fill-muted" fontSize="12">
        {clock(first.epoch)}
      </text>
      <text x={W - PAD_R} y={H - 8} textAnchor="end" className="fill-muted" fontSize="12">
        {clock(last.epoch)}
      </text>
    </svg>
  );
}