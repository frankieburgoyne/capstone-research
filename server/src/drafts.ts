import { Router } from "express";
import { pool } from "./db.js";
import { buildCpuLineup, playMatch, SLOTS } from "./matchup.js";
import type { PoolCard } from "./matchup.js";

export const draftsRouter = Router();

// How many cards of each type are offered in a draft
const POOL_SIZE: Record<string, number> = {
  QB: 10, RB: 12, WR: 18, TE: 10, K: 8, DL: 12, LB: 12, DB: 12,
};

// Players who played fewer games than this are not offered (keeps out bench players)
const MIN_GAMES = 8;

type PoolRow = { player_id: string; season: number; position_group: string; cost: number; tier: string };

// Picks random cards for a pool. Each allowed tier gets an equal share of every
// card type, so there is always a mix of cheap and expensive options.
// Cost and tier use the same rules as tokens.ts: rank within the same season and
// card type, 1 to 100, with the tier cutoffs at 50%, 80% and 95%. Keep them in sync.
async function buildPool(minSeason: number, maxSeason: number, tiers: string[]): Promise<PoolRow[]> {
  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT player_id, season, position_group, games,
              PERCENT_RANK() OVER (PARTITION BY season, position_group ORDER BY fantasy_points) AS pct
       FROM cards
       WHERE position_group IS NOT NULL
     ), priced AS (
       SELECT player_id, season, position_group, games,
              GREATEST(1, ROUND((pct * 100)::numeric))::int AS cost,
              CASE WHEN pct >= 0.95 THEN 'elite'
                   WHEN pct >= 0.8 THEN 'gold'
                   WHEN pct >= 0.5 THEN 'silver'
                   ELSE 'bronze' END AS tier
       FROM ranked
     ), eligible AS (
       SELECT * FROM priced
       WHERE season BETWEEN $1 AND $2 AND tier = ANY($3::text[]) AND games >= $4
     )
     SELECT player_id, season, position_group, cost, tier,
            ROW_NUMBER() OVER (PARTITION BY position_group, tier ORDER BY random()) AS rn
     FROM eligible`,
    [minSeason, maxSeason, tiers, MIN_GAMES]
  );

  const chosen: PoolRow[] = [];
  for (const group of Object.keys(POOL_SIZE)) {
    const size = POOL_SIZE[group];
    const perTier = Math.ceil(size / tiers.length);
    const inGroup = rows.filter((r: any) => r.position_group === group);
    // First, an equal share from each tier
    const picked = inGroup.filter((r: any) => r.rn <= perTier);
    // If a tier ran short, fill up with extra cards from the other tiers
    const extras = inGroup.filter((r: any) => r.rn > perTier);
    const all = [...picked, ...extras].slice(0, size);
    for (const r of all) {
      chosen.push({
        player_id: r.player_id, season: r.season, position_group: r.position_group,
        cost: r.cost, tier: r.tier,
      });
    }
  }
  return chosen;
}

// A pool is fair only if the cheapest possible lineup fits inside the budget
function canFillLineup(cards: PoolRow[], budget: number): boolean {
  let minTotal = 0;
  for (const group of new Set(SLOTS.map((s) => s.group))) {
    const needed = SLOTS.filter((s) => s.group === group).length;
    const costs = cards.filter((c) => c.position_group === group).map((c) => c.cost).sort((a, b) => a - b);
    if (costs.length < needed) return false;
    for (let i = 0; i < needed; i++) minTotal += costs[i];
  }
  return minTotal <= budget;
}

// POST /api/drafts  { modeSlug }  -> { id, resumed }
draftsRouter.post("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const slug = String(req.body?.modeSlug ?? "");
  try {
    const { rows: modeRows } = await pool.query("SELECT * FROM game_modes WHERE slug = $1", [slug]);
    const mode = modeRows[0];
    if (!mode) return res.status(404).json({ error: "That game mode does not exist." });
    if (req.user.best_trophies < mode.unlock_trophies) {
      return res.status(403).json({ error: "That game mode is still locked." });
    }

    // If a draft is already open in this mode, go back to it
    const { rows: open } = await pool.query(
      "SELECT id FROM drafts WHERE user_id = $1 AND mode_slug = $2 AND status = 'open'",
      [req.user.id, slug]
    );
    if (open[0]) return res.json({ id: open[0].id, resumed: true });

    // Build a pool (try a few times in case a random season has too few cards)
    let season: number | null = null;
    let cards: PoolRow[] | null = null;
    for (let attempt = 0; attempt < 5 && !cards; attempt++) {
      if (mode.min_season === mode.max_season) {
        season = mode.min_season;
      } else if (mode.random_season) {
        season = mode.min_season + Math.floor(Math.random() * (mode.max_season - mode.min_season + 1));
      }
      const candidate = await buildPool(season ?? mode.min_season, season ?? mode.max_season, mode.allowed_tiers);
      if (canFillLineup(candidate, mode.budget)) cards = candidate;
    }
    if (!cards) {
      return res.status(500).json({ error: "Could not build a draft pool. Has the card import finished?" });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
      // Pay the entry fee. This only succeeds if the user has enough tokens.
      const paid = await client.query(
        "UPDATE users SET tokens = tokens - $1 WHERE id = $2 AND tokens >= $1",
        [mode.entry_fee, req.user.id]
      );
      if (paid.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(402).json({ error: `You need ${mode.entry_fee} tokens to enter this mode.` });
      }
      const { rows } = await client.query(
        "INSERT INTO drafts (user_id, mode_slug, season, entry_fee) VALUES ($1, $2, $3, $4) RETURNING id",
        [req.user.id, slug, season, mode.entry_fee]
      );
      const draftId = rows[0].id;
      await client.query(
        `INSERT INTO draft_cards (draft_id, player_id, season, position_group, cost, tier)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::int[], $6::text[])`,
        [
          draftId,
          cards.map((c) => c.player_id),
          cards.map((c) => c.season),
          cards.map((c) => c.position_group),
          cards.map((c) => c.cost),
          cards.map((c) => c.tier),
        ]
      );
      await client.query("COMMIT");
      res.status(201).json({ id: draftId, resumed: false });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start the draft." });
  }
});

// GET /api/drafts/:id -> the draft, its cards (picked cards have a slot), and the match result if played
draftsRouter.get("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad draft id." });
  try {
    const { rows: drafts } = await pool.query(
      `SELECT d.id, d.status, d.season, d.total_cost, m.slug AS mode_slug, m.name AS mode_name, m.budget
       FROM drafts d JOIN game_modes m ON m.slug = d.mode_slug
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, req.user.id]
    );
    if (!drafts[0]) return res.status(404).json({ error: "Draft not found." });

    const { rows: cards } = await pool.query(
      `SELECT dc.slot, dc.cost AS tokens, dc.tier,
              c.player_id, c.season, c.name, c.position, c.position_group, c.team, c.headshot_url, c.games,
              c.passing_yards, c.passing_tds, c.rushing_yards, c.rushing_tds,
              c.receptions, c.receiving_yards, c.receiving_tds,
              c.def_tackles_solo, c.def_tackle_assists, c.def_tackles_for_loss, c.def_sacks,
              c.def_qb_hits, c.def_interceptions, c.def_pass_defended, c.def_fumbles_forced, c.def_tds,
              c.fg_made, c.fg_att, c.fg_long, c.pat_made, c.fantasy_points
       FROM draft_cards dc
       JOIN cards c ON c.player_id = dc.player_id AND c.season = dc.season
       WHERE dc.draft_id = $1
       ORDER BY c.position_group, dc.cost DESC, c.name`,
      [id]
    );
    const { rows: matches } = await pool.query(
      `SELECT result, opponent_name, user_total, cpu_total, trophy_delta, token_delta, details
       FROM matches WHERE draft_id = $1`,
      [id]
    );
    const m = matches[0];
    const match = m
      ? {
          result: m.result,
          opponent_name: m.opponent_name,
          user_total: m.user_total,
          cpu_total: m.cpu_total,
          trophy_delta: m.trophy_delta,
          token_delta: m.token_delta,
          slots: m.details.slots,
        }
      : null;
    res.json({ draft: drafts[0], cards, match });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the draft." });
  }
});

// POST /api/drafts/:id/submit  { picks: { QB: { player_id, season }, RB: ..., WR1: ..., ... } }
// Saves the lineup, plays it against the computer, and applies the trophies and tokens.
draftsRouter.post("/:id/submit", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad draft id." });
  const picks = req.body?.picks;
  if (!picks || typeof picks !== "object") return res.status(400).json({ error: "No lineup was sent." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: drafts } = await client.query(
       `SELECT d.id, d.status, d.entry_fee, m.budget, m.bot_noise, m.win_trophies, m.loss_trophies
       FROM drafts d JOIN game_modes m ON m.slug = d.mode_slug
       WHERE d.id = $1 AND d.user_id = $2
       FOR UPDATE OF d`,
      [id, req.user.id]
    );
    const draft = drafts[0];
    if (!draft) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Draft not found." });
    }
    if (draft.status !== "open") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This draft was already submitted." });
    }

    const { rows: pool_ } = await client.query(
      `SELECT dc.player_id, dc.season, dc.position_group, dc.cost, dc.tier,
              c.name, c.position, c.team, c.headshot_url, c.fantasy_points
       FROM draft_cards dc
       JOIN cards c ON c.player_id = dc.player_id AND c.season = dc.season
       WHERE dc.draft_id = $1`,
      [id]
    );

    let total = 0;
    const usedCards = new Set<string>();
    const usedPlayers = new Set<string>();
    const chosen: { slot: string; player_id: string; season: number }[] = [];
    const userLineup: Record<string, PoolCard> = {};
    for (const { slot, group } of SLOTS) {
      const pick = picks[slot];
      const card = pool_.find(
        (c: any) => c.player_id === String(pick?.player_id) && c.season === Number(pick?.season)
      );
      if (!card) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Pick a card for ${slot} from the pool.` });
      }
      if (card.position_group !== group) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `That card does not fit the ${slot} slot.` });
      }
      const key = `${card.player_id}-${card.season}`;
      if (usedCards.has(key) || usedPlayers.has(card.player_id)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "The same player cannot be used twice." });
      }
      usedCards.add(key);
      usedPlayers.add(card.player_id);
      total += card.cost;
      chosen.push({ slot, player_id: card.player_id, season: card.season });
      userLineup[slot] = card as PoolCard;
    }
    if (total > draft.budget) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Lineup costs ${total} tokens; the budget is ${draft.budget}.` });
    }

    for (const c of chosen) {
      await client.query(
        "UPDATE draft_cards SET slot = $1 WHERE draft_id = $2 AND player_id = $3 AND season = $4",
        [c.slot, id, c.player_id, c.season]
      );
    }
    await client.query(
      "UPDATE drafts SET status = 'submitted', total_cost = $1, submitted_at = now() WHERE id = $2",
      [total, id]
    );

    // The computer drafts from the same pool, then the two lineups play
    const cpuLineup = buildCpuLineup(pool_ as PoolCard[], draft.budget, Number(draft.bot_noise));
    if (!cpuLineup) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "The computer could not build a lineup." });
    }
    const outcome = playMatch(userLineup, cpuLineup);

    // Trophies and tokens move up or down, but never below zero
    const { rows: people } = await client.query(
      "SELECT trophies, best_trophies, tokens FROM users WHERE id = $1 FOR UPDATE",
      [req.user.id]
    );
    const me = people[0];
    // The entry fee was already paid when the draft started.
    // A win pays back double the fee, a draw pays back the fee, a loss pays nothing.
    let wantTrophies = 0;
    let payout = 0;
    if (outcome.result === "win") {
      wantTrophies = draft.win_trophies;
      payout = draft.entry_fee * 2;
    } else if (outcome.result === "loss") {
      wantTrophies = -draft.loss_trophies;
    } else {
      payout = draft.entry_fee;
    }
    const newTrophies = Math.max(0, me.trophies + wantTrophies);
    const newTokens = me.tokens + payout;
    await client.query(
      "UPDATE users SET trophies = $1, best_trophies = $2, tokens = $3 WHERE id = $4",
      [newTrophies, Math.max(me.best_trophies, newTrophies), newTokens, req.user.id]
    );
    const trophyDelta = newTrophies - me.trophies;
    const tokenDelta = payout - draft.entry_fee; // net result of the match (the fee was paid earlier)

    await client.query(
      `INSERT INTO matches
         (draft_id, user_id, opponent_name, result, user_total, cpu_total, trophy_delta, token_delta, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, req.user.id, outcome.opponentName, outcome.result,
        outcome.userTotal, outcome.cpuTotal, trophyDelta, tokenDelta,
        JSON.stringify({ slots: outcome.slots }),
      ]
    );
    await client.query("COMMIT");
    res.json({ ok: true, total_cost: total });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not save the lineup." });
  } finally {
    client.release();
  }
});