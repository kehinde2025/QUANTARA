import { z } from "zod";

// Email: trimmed and lowercased here, so what reaches the database always
// passes the "users_email_lowercase" rule.
const email = z.string().trim().toLowerCase().email().max(254);

// Password rules for NEW passwords. Length matters more than symbols, so we
// require 10+ characters and don't force special characters. The upper limit
// stops someone sending a huge password to make the server waste time hashing.
const newPassword = z.string().min(10).max(128);

export const registerSchema = z.object({
  email,
  password: newPassword,
});

// Login does NOT re-check strength. It only needs something to compare.
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
