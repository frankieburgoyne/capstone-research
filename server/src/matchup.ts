// The rules for the computer opponent and for playing a matchup.

// The 9 lineup slots and which card type fits each one
export const SLOTS = [
  { slot: "QB", group: "QB" },
  { slot: "RB", group: "RB" },
  { slot: "WR1", group: "WR" },
  { slot: "WR2", group: "WR" },
  { slot: "TE", group: "TE" },
  { slot: "K", group: "K" },
  { slot: "DL", group: "DL" },
  { slot: "LB", group: "LB" },
  { slot: "DB", group: "DB" },
];

const OPPONENT_NAMES = [
  "Gridiron Bot", "Blitz Bot", "Hail Mary Bot", "Red Zone Bot", "Audible Bot", "Pocket Bot",
];

export type PoolCard = {
  player_id: string;
  season: number;
  position_group: string;
  cost: number;
  tier: string;
  name: string;
  position: string;
  team: string;
  headshot_url: string | null;
  fantasy_points: number;
};

type Option = { cost: number; value: number; cards: PoolCard[] };

// The computer drafts from the same pool and budget as the player. It picks the
// lineup with the most (noisy) fantasy points that fits the budget. "noise" is how
// wrongly it values cards: 0 means perfect, 0.5 means each card's value can be off by up to 50%.
export function buildCpuLineup(
  pool: PoolCard[],
  budget: number,
  noise: number
): Record<string, PoolCard> | null {
  const groups = [...new Set(SLOTS.map((s) => s.group))];

  // One decision per card type. A type with two slots (WR) chooses a pair of different players.
  const decisions: Option[][] = groups.map((group) => {
    const cards = pool.filter((c) => c.position_group === group);
    const value = (c: PoolCard) => c.fantasy_points * (1 + (Math.random() * 2 - 1) * noise);
    const valued = cards.map((c) => ({ c, v: value(c) }));
    const slotCount = SLOTS.filter((s) => s.group === group).length;
    if (slotCount === 1) {
      return valued.map(({ c, v }) => ({ cost: c.cost, value: v, cards: [c] }));
    }
    const pairs: Option[] = [];
    for (let i = 0; i < valued.length; i++) {
      for (let j = i + 1; j < valued.length; j++) {
        if (valued[i].c.player_id === valued[j].c.player_id) continue;
        pairs.push({
          cost: valued[i].c.cost + valued[j].c.cost,
          value: valued[i].v + valued[j].v,
          cards: [valued[i].c, valued[j].c],
        });
      }
    }
    return pairs;
  });

  // Dynamic programming: best total value for each amount of budget spent so far
  let best: number[] = new Array(budget + 1).fill(-Infinity);
  best[0] = 0;
  const chosenIndex: number[][] = [];
  for (const options of decisions) {
    const next: number[] = new Array(budget + 1).fill(-Infinity);
    const pick: number[] = new Array(budget + 1).fill(-1);
    for (let spent = 0; spent <= budget; spent++) {
      if (best[spent] === -Infinity) continue;
      for (let k = 0; k < options.length; k++) {
        const total = spent + options[k].cost;
        if (total > budget) continue;
        const value = best[spent] + options[k].value;
        if (value > next[total]) {
          next[total] = value;
          pick[total] = k;
        }
      }
    }
    chosenIndex.push(pick);
    best = next;
  }

  let endSpent = -1;
  for (let spent = 0; spent <= budget; spent++) {
    if (best[spent] > -Infinity && (endSpent === -1 || best[spent] > best[endSpent])) endSpent = spent;
  }
  if (endSpent === -1) return null;

  // Walk backwards to recover which option was chosen for each card type
  const lineup: Record<string, PoolCard> = {};
  let spent = endSpent;
  for (let g = decisions.length - 1; g >= 0; g--) {
    const option = decisions[g][chosenIndex[g][spent]];
    const slots = SLOTS.filter((s) => s.group === groups[g]);
    const cards = [...option.cards].sort((a, b) => b.fantasy_points - a.fantasy_points);
    slots.forEach((s, i) => (lineup[s.slot] = cards[i]));
    spent -= option.cost;
  }
  return lineup;
}

// On game day a card scores between 80% and 120% of its season total
export function rollScore(points: number): number {
  return Math.round(points * (0.8 + Math.random() * 0.4) * 10) / 10;
}

export type SlotResult = {
  slot: string;
  you: PoolCard & { score: number };
  cpu: PoolCard & { score: number };
};

export type MatchOutcome = {
  opponentName: string;
  result: "win" | "loss" | "draw";
  userTotal: number;
  cpuTotal: number;
  slots: SlotResult[];
};

export function playMatch(
  userLineup: Record<string, PoolCard>,
  cpuLineup: Record<string, PoolCard>
): MatchOutcome {
  const slots: SlotResult[] = SLOTS.map(({ slot }) => ({
    slot,
    you: { ...userLineup[slot], score: rollScore(userLineup[slot].fantasy_points) },
    cpu: { ...cpuLineup[slot], score: rollScore(cpuLineup[slot].fantasy_points) },
  }));
  const userTotal = Math.round(slots.reduce((sum, s) => sum + s.you.score, 0) * 10) / 10;
  const cpuTotal = Math.round(slots.reduce((sum, s) => sum + s.cpu.score, 0) * 10) / 10;
  const result = userTotal > cpuTotal ? "win" : userTotal < cpuTotal ? "loss" : "draw";
  const opponentName = OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
  return { opponentName, result, userTotal, cpuTotal, slots };
}