import { describe, expect, it } from "vitest";
import { assertTransition, canSendPurchase, canTransition, isTerminal } from "./intentStates.js";
import type { IntentState } from "./intentStates.js";

const ALL: IntentState[] = [
  "created",
  "risk_approved",
  "proposal_obtained",
  "purchase_sent",
  "purchase_confirmed",
  "purchase_uncertain",
  "needs_review",
  "rejected",
  "failed",
];

describe("trade attempt states", () => {
  it("follows the normal path one step at a time", () => {
    expect(canTransition("created", "risk_approved")).toBe(true);
    expect(canTransition("risk_approved", "proposal_obtained")).toBe(true);
    expect(canTransition("proposal_obtained", "purchase_sent")).toBe(true);
    expect(canTransition("purchase_sent", "purchase_confirmed")).toBe(true);
  });

  it("cannot skip a step", () => {
    expect(canTransition("created", "proposal_obtained")).toBe(false);
    expect(canTransition("created", "purchase_sent")).toBe(false);
    expect(canTransition("risk_approved", "purchase_sent")).toBe(false);
    expect(canTransition("created", "purchase_confirmed")).toBe(false);
  });

  it("allows sending a purchase from one state only", () => {
    for (const state of ALL) {
      expect(canSendPurchase(state)).toBe(state === "proposal_obtained");
    }
  });

  it("never goes back to sending after an unclear purchase", () => {
    expect(canTransition("purchase_uncertain", "purchase_sent")).toBe(false);
    expect(canTransition("purchase_uncertain", "proposal_obtained")).toBe(false);
    expect(canTransition("needs_review", "purchase_sent")).toBe(false);
    const exits = ALL.filter((to) => canTransition("purchase_uncertain", to));
    expect(exits.sort()).toEqual(["failed", "needs_review", "purchase_confirmed"]);
  });

  it("has no way out of a finished state", () => {
    for (const done of ["purchase_confirmed", "rejected", "failed"] as IntentState[]) {
      expect(isTerminal(done)).toBe(true);
      for (const to of ALL) expect(canTransition(done, to)).toBe(false);
    }
    expect(isTerminal("created")).toBe(false);
    expect(isTerminal("purchase_uncertain")).toBe(false);
  });

  it("treats an explicit Deriv refusal as rejected, never as failed", () => {
    expect(canTransition("purchase_sent", "rejected")).toBe(true);
    expect(canTransition("purchase_sent", "failed")).toBe(false);
  });

  it("throws on an illegal move and names both states", () => {
    expect(() => assertTransition("created", "purchase_sent")).toThrow("created -> purchase_sent");
    expect(() => assertTransition("created", "risk_approved")).not.toThrow();
  });
});