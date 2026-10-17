import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./schemas.js";

describe("registerSchema", () => {
  it("trims and lowercases the email", () => {
    const result = registerSchema.safeParse({
      email: "  Test@Example.COM ",
      password: "a-long-enough-password",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("test@example.com");
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "a-long-enough-password",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 10 characters", () => {
    const result = registerSchema.safeParse({
      email: "a@example.com",
      password: "short123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a password of exactly 10 characters", () => {
    const result = registerSchema.safeParse({
      email: "a@example.com",
      password: "1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password longer than 128 characters", () => {
    const result = registerSchema.safeParse({
      email: "a@example.com",
      password: "x".repeat(129),
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a short password, because login only compares it", () => {
    const result = loginSchema.safeParse({ email: "a@example.com", password: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("lowercases the email on login too", () => {
    const result = loginSchema.safeParse({ email: "A@Example.com", password: "abc" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("a@example.com");
  });
});