export type Candle = { epoch: number; open: number; high: number; low: number; close: number };

export type Direction = "rise" | "fall";

// What a strategy returns when it sees a chance. It is only a suggestion.
export type CandidateSignal = {
  strategy: string;
  direction: Direction;
  contractType: "CALL" | "PUT";
  // Plain-language reason, shown to the customer.
  reason: string;
  // The numbers behind the decision, kept so it can be checked later.
  details: Record<string, number>;
};

export interface Strategy {
  readonly id: string;
  // Gets CLOSED candles only, oldest first. Returns a suggestion or null.
  evaluate(candles: Candle[]): CandidateSignal | null;
}