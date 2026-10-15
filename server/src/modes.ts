import { Router } from "express";
import { pool } from "./db.js";

export const modesRouter = Router();

// Test buttons that change your trophies and tokens. They only work when the server has
// ALLOW_DEV_TROPHIES=true in its environment (set it in server/.env, never on Render).
const DEV_TOOLS = process.env.ALLOW_DEV_TROPHIES === "true";

// The free bonus that keeps players from getting stuck with no tokens
const BONUS_AMOUNT = 25;

const USER_COLUMNS = "id, email, display_name, tokens, trophies, best_trophies";

// GET /api/modes -> every mode (with unlocked: true/false) and the state of the daily bonus
modesRouter.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, description, unlock_trophies, min_season, max_season,
              random_season, allowed_tiers, budget,
              entry_fee, win_trophies, loss_trophies
       FROM game_modes
       ORDER BY sort_order`
    );
    const { rows: bonusRows } = await pool.query(
      `SELECT (last_bonus_at IS NULL OR last_bonus_at <= now() - interval '24 hours') AS available,
              last_bonus_at + interval '24 hours' AS next_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const best = req.user.best_trophies;
    res.json({
      devTools: DEV_TOOLS,
      bonus: {
        amount: BONUS_AMOUNT,
        available: bonusRows[0].available,
        next_at: bonusRows[0].available ? null : bonusRows[0].next_at,
      },
      modes: rows.map((m: any) => ({ ...m, unlocked: best >= m.unlock_trophies })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load game modes." });
  }
});

// POST /api/modes/daily-bonus -> gives BONUS_AMOUNT tokens, at most once every 24 hours
modesRouter.post("/daily-bonus", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    // One statement checks the 24 hours and pays out, so two quick clicks cannot both succeed
    const { rows } = await pool.query(
      `UPDATE users
       SET tokens = tokens + $1, last_bonus_at = now()
       WHERE id = $2 AND (last_bonus_at IS NULL OR last_bonus_at <= now() - interval '24 hours')
       RETURNING ${USER_COLUMNS}`,
      [BONUS_AMOUNT, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "You already claimed today's bonus." });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not claim the bonus." });
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
       RETURNING ${USER_COLUMNS}`,
      [delta, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update trophies." });
  }
});

// POST /api/modes/dev-tokens  { delta: 100 }  (testing only)
modesRouter.post("/dev-tokens", async (req, res) => {
  if (!DEV_TOOLS) return res.status(404).json({ error: "Not found." });
  if (!req.user) return res.status(401).json({ error: "Not logged in." });

  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 5000) {
    return res.status(400).json({ error: "delta must be a whole number between -5000 and 5000." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET tokens = GREATEST(0, tokens + $1) WHERE id = $2 RETURNING ${USER_COLUMNS}`,
      [delta, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update tokens." });
  }
});

// POST /api/modes/dev-reset-bonus  (testing only: makes the daily bonus claimable again)
modesRouter.post("/dev-reset-bonus", async (req, res) => {
  if (!DEV_TOOLS) return res.status(404).json({ error: "Not found." });
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    await pool.query("UPDATE users SET last_bonus_at = NULL WHERE id = $1", [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reset the bonus." });
  }
});