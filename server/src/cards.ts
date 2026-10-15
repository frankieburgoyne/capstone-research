import { Router } from "express";
import { pool } from "./db.js";
import { tokensFromPercentile, tierFromPercentile } from "./tokens.js";

export const cardsRouter = Router();

// GET /api/cards/seasons -> [2026, 2025, ...]
cardsRouter.get("/seasons", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT season FROM cards ORDER BY season DESC"
    );
    res.json(rows.map((r: any) => r.season));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load seasons. Has the import been run?" });
  }
});

// GET /api/cards/teams?season=2023 -> ["ARI", "ATL", ...]
cardsRouter.get("/teams", async (req, res) => {
  const season = Number(req.query.season);
  if (!Number.isInteger(season)) {
    return res.status(400).json({ error: "season is required" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT team FROM cards WHERE season = $1 ORDER BY team",
      [season]
    );
    res.json(rows.map((r: any) => r.team));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load teams" });
  }
});

// GET /api/cards?season=2023&team=KC -> player cards with token values.
// "pct" is how the player ranks against everyone at the same card type in that
// season (0 = worst, 1 = best). Tokens and tier come from it.
cardsRouter.get("/", async (req, res) => {
  const season = Number(req.query.season);
  const team = String(req.query.team ?? "");
  if (!Number.isInteger(season) || !team) {
    return res.status(400).json({ error: "season and team are required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT player_id, name, position, position_group, team, headshot_url, games,
                passing_yards, passing_tds, rushing_yards, rushing_tds,
                receptions, receiving_yards, receiving_tds,
                def_tackles_solo, def_tackle_assists, def_tackles_for_loss, def_sacks,
                def_qb_hits, def_interceptions, def_pass_defended, def_fumbles_forced, def_tds,
                fg_made, fg_att, fg_long, pat_made,
                fantasy_points,
                PERCENT_RANK() OVER (PARTITION BY position_group ORDER BY fantasy_points) AS pct
         FROM cards
         WHERE season = $1 AND position_group IS NOT NULL
       ) ranked
       WHERE team = $2
       ORDER BY pct DESC, fantasy_points DESC`,
      [season, team]
    );
    const cards = rows.map((r: any) => ({
      ...r,
      tokens: tokensFromPercentile(r.pct),
      tier: tierFromPercentile(r.pct),
    }));
    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load cards" });
  }
});