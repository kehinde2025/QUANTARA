import MarketsView from "@/components/MarketsView";
import { PageHeader } from "@/components/ui";

export default function MarketsPage() {
  return (
    <>
      <PageHeader title="Markets" subtitle="Live prices from Deriv" />
      <MarketsView />
    </>
  );
}