// Exponential moving average. The first value is the simple average of the
// first `period` prices; after that each price is blended in with weight
// 2 / (period + 1). Positions before the first value are null.
export function ema(values: number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("EMA period must be a whole number of at least 1");
  }
  const out: (number | null)[] = values.map(() => null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Relative Strength Index (Wilder's method), from 0 to 100. The first value
// needs `period + 1` prices. Positions before it are null.
export function rsi(values: number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 2) {
    throw new Error("RSI period must be a whole number of at least 2");
  }
  const out: (number | null)[] = values.map(() => null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiValue(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}