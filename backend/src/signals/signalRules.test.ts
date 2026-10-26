import { describe, expect, it } from "vitest";
import type { SignalStatus } from "./signalRules.js";
import { SIGNAL_VALIDITY_MS, effectiveStatus, expiryFor, isExecutable } from "./signalRules.js";

const created = new Date("2026-10-26T10:00:00.000Z");
const expires = expiryFor(created);

describe("signal rules", () => {
  it("expires 60 seconds after creation", () => {
    expect(SIGNAL_VALIDITY_MS).toBe(60_000);
    expect(expires.getTime() - created.getTime()).toBe(60_000);
  });

  it("stays valid before its expiry and is expired from the expiry moment on", () => {
    expect(effectiveStatus("valid", expires, new Date(expires.getTime() - 1))).toBe("valid");
    expect(effectiveStatus("valid", expires, expires)).toBe("expired");
    expect(effectiveStatus("valid", expires, new Date(expires.getTime() + 5000))).toBe("expired");
  });

  it("never rewrites a finished status as expired", () => {
    const late = new Date(expires.getTime() + 60_000);
    for (const status of ["executed", "rejected", "cancelled", "failed"] as SignalStatus[]) {
      expect(effectiveStatus(status, expires, late)).toBe(status);
    }
  });

  it("lets only a valid, unexpired signal be acted on", () => {
    const before = new Date(expires.getTime() - 1000);
    expect(isExecutable("valid", expires, before)).toBe(true);
    expect(isExecutable("valid", expires, expires)).toBe(false);
    for (const status of ["new", "expired", "cancelled", "executed", "rejected", "failed"] as SignalStatus[]) {
      expect(isExecutable(status, expires, before)).toBe(false);
    }
  });

  it("treats a new signal past its expiry as expired", () => {
    expect(effectiveStatus("new", expires, expires)).toBe("expired");
  });
});