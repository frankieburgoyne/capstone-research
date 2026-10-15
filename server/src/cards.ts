import { Router } from "express";
import { pool } from "./db.js";
import { tokensFor, tierFor } from "./tokens.js";

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

// GET /api/cards?season=2023&team=KC -> player cards with token values
cardsRouter.get("/", async (req, res) => {
  const season = Number(req.query.season);
  const team = String(req.query.team ?? "");
  if (!Number.isInteger(season) || !team) {
    return res.status(400).json({ error: "season and team are required" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT player_id, name, position, team, headshot_url, games,
              passing_yards, passing_tds, rushing_yards, rushing_tds,
              receptions, receiving_yards, receiving_tds, fantasy_points
       FROM cards
       WHERE season = $1 AND team = $2
       ORDER BY fantasy_points DESC`,
      [season, team]
    );
    const cards = rows.map((r: any) => {
      const tokens = tokensFor(r.fantasy_points);
      return { ...r, tokens, tier: tierFor(tokens) };
    });
    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load cards" });
  }
});