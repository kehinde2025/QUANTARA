// The life of one trade attempt. It can only move along the arrows below.
//
//   created -> risk_approved -> proposal_obtained -> purchase_sent
//   purchase_sent -> purchase_confirmed | rejected | purchase_uncertain
//   purchase_uncertain -> purchase_confirmed | failed | needs_review
//   needs_review -> purchase_confirmed | failed
//
// "purchase_uncertain" means a purchase was sent and the answer was lost or
// unclear. From there nothing is ever sent again: Deriv's records are checked
// to find out what happened.
export type IntentState =
  | "created"
  | "risk_approved"
  | "proposal_obtained"
  | "purchase_sent"
  | "purchase_confirmed"
  | "purchase_uncertain"
  | "needs_review"
  | "rejected"
  | "failed";

const ALLOWED: Record<IntentState, IntentState[]> = {
  created: ["risk_approved", "rejected"],
  risk_approved: ["proposal_obtained", "rejected", "failed"],
  proposal_obtained: ["purchase_sent", "rejected"],
  purchase_sent: ["purchase_confirmed", "rejected", "purchase_uncertain"],
  purchase_uncertain: ["purchase_confirmed", "failed", "needs_review"],
  needs_review: ["purchase_confirmed", "failed"],
  purchase_confirmed: [],
  rejected: [],
  failed: [],
};

export function canTransition(from: IntentState, to: IntentState): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: IntentState, to: IntentState): void {
  if (!canTransition(from, to)) throw new Error(`Illegal trade attempt move: ${from} -> ${to}`);
}

// Finished for good: no further move is possible.
export function isTerminal(state: IntentState): boolean {
  return ALLOWED[state].length === 0;
}

// The ONLY state from which a purchase may be sent.
export function canSendPurchase(state: IntentState): boolean {
  return state === "proposal_obtained";
}