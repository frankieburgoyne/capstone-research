// Tokens are based on how a card ranks among players at the SAME position
// in the SAME season. pct is a number from 0 (worst) to 1 (best).

export type Tier = "elite" | "gold" | "silver" | "bronze";

export function tokensFromPercentile(pct: number): number {
  return Math.max(1, Math.round(pct * 100));
}

export function tierFromPercentile(pct: number): Tier {
  if (pct >= 0.95) return "elite";
  if (pct >= 0.8) return "gold";
  if (pct >= 0.5) return "silver";
  return "bronze";
}