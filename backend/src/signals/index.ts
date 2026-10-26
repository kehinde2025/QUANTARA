import { SIGNAL_SYMBOLS } from "../config.js";
import { marketService } from "../market/index.js";
import { createEmaCross } from "../strategies/emaCross.js";
import { createRsiReversal } from "../strategies/rsiReversal.js";
import { SignalRunner } from "./signalRunner.js";
import { expireOverdueSignals, publishSignal } from "./signalService.js";

// The one signal runner for the whole process.
export const signalRunner = new SignalRunner({
  symbols: SIGNAL_SYMBOLS,
  strategies: [createEmaCross(), createRsiReversal()],
  watch: (symbol, listener) => marketService.watch(symbol, listener),
  fetchCandles: (symbol, count, granularity) => marketService.getCandles(symbol, count, granularity),
  publish: publishSignal,
  expireOverdue: () => expireOverdueSignals(),
  log: (message) => console.log(`[signals] ${message}`),
});