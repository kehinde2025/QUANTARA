import { MarketService } from "../market/marketService.js";
import { createEmaCross } from "../strategies/emaCross.js";
import { createRsiReversal } from "../strategies/rsiReversal.js";

const symbol = process.argv[2] ?? "R_100";
const service = new MarketService();
service.start();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 50 && service.snapshot(symbol).feed !== "open"; i++) await wait(100);

  const candles = await service.getCandles(symbol, 500, 60);
  console.log(`${symbol}: ${candles.length} one-minute candles loaded`);

  for (const strategy of [createEmaCross(), createRsiReversal()]) {
    let rise = 0;
    let fall = 0;
    for (let i = 1; i <= candles.length; i++) {
      const idea = strategy.evaluate(candles.slice(0, i));
      if (idea?.direction === "rise") rise++;
      if (idea?.direction === "fall") fall++;
    }
    console.log(`${strategy.id}: ${rise} rise ideas, ${fall} fall ideas`);
  }
  console.log("This only counts how often the rules fire. It says nothing about whether they would make money.");
  service.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("replay check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});