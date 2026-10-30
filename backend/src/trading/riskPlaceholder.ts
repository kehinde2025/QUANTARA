import type { ExecuteRequest } from "./engine.js";

// The only risk gate installed until Stage 9. It refuses EVERYTHING, so the
// engine cannot buy anything yet, whatever the buying switch says.
export async function denyAllUntilRiskEngine(_request: ExecuteRequest): Promise<{ approved: false; reason: string }> {
  return { approved: false, reason: "risk_engine_not_installed" };
}