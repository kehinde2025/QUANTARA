import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./tokenCrypto.js";

const KEY = randomBytes(32).toString("base64");
const original = process.env.TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (original === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = original;
});

describe("tokenCrypto", () => {
  it("round-trips a secret for the same user", () => {
    const enc = encryptSecret("pat_secret_value_123", "user-1");
    expect(decryptSecret(enc, "user-1")).toBe("pat_secret_value_123");
  });

  it("never contains the plain text", () => {
    expect(encryptSecret("pat_secret_value_123", "user-1")).not.toContain("pat_secret_value_123");
  });

  it("gives a different result every time for the same input", () => {
    expect(encryptSecret("same", "user-1")).not.toBe(encryptSecret("same", "user-1"));
  });

  it("refuses to unlock for a different user", () => {
    const enc = encryptSecret("pat_secret_value_123", "user-1");
    expect(() => decryptSecret(enc, "user-2")).toThrow();
  });

  it("refuses a tampered value", () => {
    const parts = encryptSecret("pat_secret_value_123", "user-1").split(".");
    parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
    expect(() => decryptSecret(parts.join("."), "user-1")).toThrow();
  });

  it("fails loudly when the key is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("x", "user-1")).toThrow("TOKEN_ENCRYPTION_KEY is not set");
  });

  it("fails loudly when the key is the wrong length", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x", "user-1")).toThrow("32 bytes");
  });
});