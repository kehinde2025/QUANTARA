import { ema } from "./indicators.js";
import type { CandidateSignal, Candle, Strategy } from "./types.js";

export type EmaCrossConfig = { fast: number; slow: number };

export const DEFAULT_EMA_CROSS: EmaCrossConfig = { fast: 9, slow: 21 };

// Rise idea when the fast average crosses ABOVE the slow one on the latest
// closed candle; fall idea when it crosses BELOW. Nothing on candles where no
// cross happens, so one cross gives one idea.
export function createEmaCross(config: EmaCrossConfig = DEFAULT_EMA_CROSS): Strategy {
  const { fast, slow } = config;
  if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 1 || slow <= fast) {
    throw new Error("EMA cross needs whole numbers with 1 <= fast < slow");
  }

  return {
    id: "ema_cross",
    evaluate(candles: Candle[]): CandidateSignal | null {
      if (candles.length < slow + 1) return null;

      const closes = candles.map((c) => c.close);
      const fastEma = ema(closes, fast);
      const slowEma = ema(closes, slow);
      const i = closes.length - 1;
      const f = fastEma[i];
      const s = slowEma[i];
      const pf = fastEma[i - 1];
      const ps = slowEma[i - 1];
      if (f == null || s == null || pf == null || ps == null) return null;

      const details = { fast: f, slow: s, prevFast: pf, prevSlow: ps };

      if (pf <= ps && f > s) {
        return {
          strategy: "ema_cross",
          direction: "rise",
          contractType: "CALL",
          reason: `The fast average (${fast}) crossed above the slow average (${slow}) on the latest closed candle.`,
          details,
        };
      }
      if (pf >= ps && f < s) {
        return {
          strategy: "ema_cross",
          direction: "fall",
          contractType: "PUT",
          reason: `The fast average (${fast}) crossed below the slow average (${slow}) on the latest closed candle.`,
          details,
        };
      }
      return null;
    },
  };
}