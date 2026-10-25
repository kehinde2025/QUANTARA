import { z } from "zod";

// Durations come as text such as "10t" or "1d"; accept numbers too.
const text = z.union([z.string(), z.number()]).transform((v) => String(v));

// One entry of Deriv's contracts_for.available. Only contract_type is required.
// Unknown extra fields are dropped.
const contractItem = z.object({
  contract_type: z.string(),
  contract_category: z.string().optional(),
  expiry_type: z.string().optional(),
  min_contract_duration: text.optional(),
  max_contract_duration: text.optional(),
  growth_rate_range: z.array(z.number()).optional(),
  last_digit_range: z.array(z.number()).optional(),
  barriers: z.number().optional(),
  sentiment: z.string().optional(),
});

export type ContractItem = z.infer<typeof contractItem>;

export const contractsForReply = z.object({
  contracts_for: z.object({ available: z.array(contractItem) }),
});

export type ContractTypeSummary = {
  contractType: string;
  category: string;
  sentiment: string | null;
  barriers: number | null;
  durations: { expiryType: string; min: string; max: string }[];
  growthRates: number[] | null;
  lastDigits: number[] | null;
};

function unionSorted(existing: number[] | null, more: number[]): number[] {
  return [...new Set([...(existing ?? []), ...more])].sort((a, b) => a - b);
}

// Several entries can share one contract type (Rise/Fall comes as separate
// tick, intraday and daily entries). Merge them into one summary per type.
export function summarizeContracts(available: ContractItem[]): ContractTypeSummary[] {
  const byType = new Map<string, ContractTypeSummary>();

  for (const item of available) {
    let summary = byType.get(item.contract_type);
    if (!summary) {
      summary = {
        contractType: item.contract_type,
        category: item.contract_category ?? "other",
        sentiment: item.sentiment ?? null,
        barriers: item.barriers ?? null,
        durations: [],
        growthRates: null,
        lastDigits: null,
      };
      byType.set(item.contract_type, summary);
    }

    const expiryType = item.expiry_type;
    const min = item.min_contract_duration;
    const max = item.max_contract_duration;
    if (expiryType !== undefined && min !== undefined && max !== undefined) {
      const known = summary.durations.some(
        (d) => d.expiryType === expiryType && d.min === min && d.max === max,
      );
      if (!known) summary.durations.push({ expiryType, min, max });
    }
    if (item.growth_rate_range) summary.growthRates = unionSorted(summary.growthRates, item.growth_rate_range);
    if (item.last_digit_range) summary.lastDigits = unionSorted(summary.lastDigits, item.last_digit_range);
  }

  return [...byType.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.contractType.localeCompare(b.contractType),
  );
}