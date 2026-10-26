export type SignalStatus =
  | "new"
  | "valid"
  | "executed"
  | "expired"
  | "cancelled"
  | "rejected"
  | "failed";

// A signal is good for one candle, 60 seconds.
export const SIGNAL_VALIDITY_MS = 60_000;

export function expiryFor(createdAt: Date, validityMs = SIGNAL_VALIDITY_MS): Date {
  return new Date(createdAt.getTime() + validityMs);
}

// What a signal's status really is at this moment. A signal that is still
// "valid" or "new" in the database but is past its expiry counts as expired.
// Finished statuses (executed, rejected, cancelled, failed) never change.
export function effectiveStatus(status: SignalStatus, expiresAt: Date, now: Date): SignalStatus {
  return (status === "valid" || status === "new") && now.getTime() >= expiresAt.getTime() ? "expired" : status;
}

// Only a valid signal that has not expired may be acted on.
export function isExecutable(status: SignalStatus, expiresAt: Date, now: Date): boolean {
  return status === "valid" && now.getTime() < expiresAt.getTime();
}