import { Card, EmptyState, PageHeader } from "@/components/ui";

const BOTS = [
  { name: "Time Duration Bot", note: "Rise/Fall contracts on a timer" },
  { name: "Accumulator Bot", note: "Accumulator contracts" },
  { name: "Digit AI Bot", note: "Digit contracts using statistical rules" },
];

export default function BotsPage() {
  return (
    <>
      <PageHeader title="Bots" subtitle="Automated trading strategies" />
      <div className="grid gap-3 lg:grid-cols-3">
        {BOTS.map((bot) => (
          <Card key={bot.name}>
            <h2 className="font-medium text-white">{bot.name}</h2>
            <p className="mt-1 text-sm text-muted">{bot.note}</p>
            <p className="mt-4 text-xs text-gold">Not available yet</p>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <EmptyState
          title="Bots are not built yet"
          body="Start, pause and stop controls, risk settings and trade history appear here once the trading engine and risk controls exist."
          stage="Stage 10"
        />
      </div>
    </>
  );
}