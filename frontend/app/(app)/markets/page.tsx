import { EmptyState, PageHeader } from "@/components/ui";

export default function MarketsPage() {
  return (
    <>
      <PageHeader title="Markets" subtitle="Live prices and available contracts" />
      <EmptyState
        title="Live markets"
        body="Prices, charts and the contracts each market supports will come from Deriv's real data. Nothing is shown until that connection is built."
        stage="Stage 6"
      />
    </>
  );
}