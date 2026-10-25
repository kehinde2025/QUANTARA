import { rsi } from "./indicators.js";
import type { CandidateSignal, Candle, Strategy } from "./types.js";

export type RsiReversalConfig = { period: number; oversold: number; overbought: number };

export const DEFAULT_RSI_REVERSAL: RsiReversalConfig = { period: 14, oversold: 30, overbought: 70 };

// Rise idea when RSI climbs back up through the oversold line; fall idea when
// it drops back down through the overbought line. Only on the candle where it
// crosses.
export function createRsiReversal(config: RsiReversalConfig = DEFAULT_RSI_REVERSAL): Strategy {
  const { period, oversold, overbought } = config;
  if (!Number.isInteger(period) || period < 2 || !(oversold > 0) || !(oversold < overbought) || !(overbought < 100)) {
    throw new Error("RSI reversal needs period >= 2 (whole number) and 0 < oversold < overbought < 100");
  }

  return {
    id: "rsi_reversal",
    evaluate(candles: Candle[]): CandidateSignal | null {
      if (candles.length < period + 2) return null;

      const values = rsi(
        candles.map((c) => c.close),
        period,
      );
      const i = values.length - 1;
      const now = values[i];
      const prev = values[i - 1];
      if (now == null || prev == null) return null;

      const details = { rsi: now, prevRsi: prev, oversold, overbought };

      if (prev < oversold && now >= oversold) {
        return {
          strategy: "rsi_reversal",
          direction: "rise",
          contractType: "CALL",
          reason: `RSI (${period}) rose back above ${oversold}: it was ${prev.toFixed(1)} and is now ${now.toFixed(1)}.`,
          details,
        };
      }
      if (prev > overbought && now <= overbought) {
        return {
          strategy: "rsi_reversal",
          direction: "fall",
          contractType: "PUT",
          reason: `RSI (${period}) dropped back below ${overbought}: it was ${prev.toFixed(1)} and is now ${now.toFixed(1)}.`,
          details,
        };
      }
      return null;
    },
  };
}