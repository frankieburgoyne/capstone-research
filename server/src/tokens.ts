// Change these two functions to rebalance the whole game. No re-import needed.

export type Tier = "elite" | "gold" | "silver" | "bronze";

// Token value of a card = its season PPR fantasy points divided by 4 (minimum 1)
export function tokensFor(fantasyPoints: number): number {
  return Math.max(1, Math.round(fantasyPoints / 4));
}

export function tierFor(tokens: number): Tier {
  if (tokens >= 80) return "elite";
  if (tokens >= 55) return "gold";
  if (tokens >= 30) return "silver";
  return "bronze";
}