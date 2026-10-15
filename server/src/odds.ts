// The math behind betting odds.
// On game day a card scores its season fantasy points times a random number between
// 0.8 and 1.2 (see rollScore in matchup.ts). Everything here follows from that one rule.

// The house keeps 8%: a fair bet at 50% would pay 2.00x, we pay 1.84x
const PAYOUT_SHARE = 0.92;

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

// Chance a card scores MORE than the line
export function probOver(seasonPoints: number, line: number): number {
  return clamp((1.2 - line / seasonPoints) / 0.4, 0.01, 0.99);
}

// Chance card A outscores card B. Adds up the chances over many possible rolls for A.
export function probFirstBeatsSecond(a: number, b: number): number {
  const steps = 400;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const rollA = 0.8 + (0.4 * (i + 0.5)) / steps;
    sum += clamp(((a * rollA) / b - 0.8) / 0.4, 0, 1);
  }
  return clamp(sum / steps, 0.01, 0.99);
}

// Odds are the payout multiplier: bet 10 at 1.84x and a win pays back 18
export function oddsFor(probability: number): number {
  return Math.max(1.05, Math.round((PAYOUT_SHARE / probability) * 100) / 100);
}