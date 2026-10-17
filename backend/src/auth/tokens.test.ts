import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./tokens.js";

describe("generateSessionToken", () => {
  it("produces a 43-character url-safe token (32 random bytes)", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different token every time", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("hashSessionToken", () => {
  it("gives the same hash for the same token", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
  });

  it("gives different hashes for different tokens", () => {
    expect(hashSessionToken("abc")).not.toBe(hashSessionToken("abd"));
  });

  it("produces 64 hex characters and never equals the token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });
});