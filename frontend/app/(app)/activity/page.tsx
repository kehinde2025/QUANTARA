import { EmptyState, PageHeader } from "@/components/ui";

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" subtitle="Open and completed contracts" />
      <EmptyState
        title="Trading activity"
        body="Open contracts, results and history with filters will appear here from real stored trades."
        stage="Stage 8 and 11"
      />
    </>
  );
}