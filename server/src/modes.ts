import { Router } from "express";
import { pool } from "./db.js";

export const modesRouter = Router();

// Test buttons that change your trophies. They only work when the server has
// ALLOW_DEV_TROPHIES=true in its environment (set it in server/.env, never on Render).
const DEV_TOOLS = process.env.ALLOW_DEV_TROPHIES === "true";

// GET /api/modes -> every mode, with unlocked: true/false for the logged-in user
modesRouter.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, description, unlock_trophies, min_season, max_season,
              random_season, allowed_tiers, budget
       FROM game_modes
       ORDER BY sort_order`
    );
    const best = req.user.best_trophies;
    res.json({
      devTools: DEV_TOOLS,
      modes: rows.map((m: any) => ({ ...m, unlocked: best >= m.unlock_trophies })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load game modes." });
  }
});

// POST /api/modes/dev-trophies  { delta: 50 }  (testing only)
modesRouter.post("/dev-trophies", async (req, res) => {
  if (!DEV_TOOLS) return res.status(404).json({ error: "Not found." });
  if (!req.user) return res.status(401).json({ error: "Not logged in." });

  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 1000) {
    return res.status(400).json({ error: "delta must be a whole number between -1000 and 1000." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET trophies = GREATEST(0, trophies + $1),
           best_trophies = GREATEST(best_trophies, trophies + $1)
       WHERE id = $2
       RETURNING id, email, display_name, tokens, trophies, best_trophies`,
      [delta, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update trophies." });
  }
});