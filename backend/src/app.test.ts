import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("backend app", () => {
  it("GET /health reports ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "quantara-backend" });
  });

  it("returns 404 for an unknown route", async () => {
    const res = await request(createApp()).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});