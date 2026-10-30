import { describe, expect, it } from "vitest";
import { denyAllUntilRiskEngine } from "./riskPlaceholder.js";
import { Decimal } from "./money.js";

describe("placeholder risk gate", () => {
  it("refuses everything until a real risk engine exists", async () => {
    const decision = await denyAllUntilRiskEngine({
      userId: "u",
      accountId: "DOT0000001",
      accountType: "demo",
      signalId: "s",
      stake: new Decimal("1"),
      currency: "USD",
      duration: 5,
      durationUnit: "t",
    });
    expect(decision).toEqual({ approved: false, reason: "risk_engine_not_installed" });
  });
});