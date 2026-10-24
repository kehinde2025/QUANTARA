import { MarketService } from "./marketService.js";

const service = new MarketService();
service.start();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 50 && service.snapshot("R_100").feed !== "open"; i++) await wait(100);

  const symbols = await service.getSymbols();
  const markets = [...new Set(symbols.map((s) => s.market))];
  console.log(`symbols: ${symbols.length}; markets: ${markets.join(", ")}`);

  const history = await service.getHistory("R_100", 100);
  console.log(`history: ${history.ticks.length} ticks, decimals ${history.decimals}`);

  let live = 0;
  const unwatch = service.watch("R_100", (e) => {
    if (e.type === "tick") live++;
  });
  await wait(10_000);
  unwatch();

  const snap = service.snapshot("R_100");
  console.log(`live ticks in 10 seconds: ${live}; stale: ${snap.stale}; feed: ${snap.feed}`);
  service.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("live check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});