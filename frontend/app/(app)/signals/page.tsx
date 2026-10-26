import SignalsView from "@/components/SignalsView";
import { PageHeader } from "@/components/ui";

export default function SignalsPage() {
  return (
    <>
      <PageHeader title="Signals" subtitle="Ideas from simple rules on live prices" />
      <SignalsView />
    </>
  );
}