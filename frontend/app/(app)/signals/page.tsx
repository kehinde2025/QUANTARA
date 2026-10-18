import { EmptyState, PageHeader } from "@/components/ui";

export default function SignalsPage() {
  return (
    <>
      <PageHeader title="Signals" subtitle="Strategy-generated signals" />
      <EmptyState
        title="Live signals"
        body="Signals come from real strategy logic and expire when they are no longer valid. They are never guaranteed predictions. Nothing is shown until real signals exist."
        stage="Stage 7"
      />
    </>
  );
}