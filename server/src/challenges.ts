import { Router } from "express";
import { pool } from "./db.js";
import { buildPool, canFillLineup } from "./drafts.js";
import type { PoolRow } from "./drafts.js";
import { areFriends } from "./social.js";

export const challengesRouter = Router();

const MAX_ACTIVE = 5; // open challenges you can have started at once
const FORFEIT_AFTER = "24 hours"; // how long a friend has to finish drafting after accepting

// Shared by the list and detail routes. "mine" is the viewer's side of the challenge.
const CHALLENGE_SELECT = `
  SELECT c.id, c.status, c.wager, c.created_at, c.accepted_at, c.winner_id,
         c.challenger_id, c.opponent_id, c.challenger_total, c.opponent_total,
         m.name AS mode_name, m.slug AS mode_slug,
         cu.display_name AS challenger_name, ou.display_name AS opponent_name,
         (SELECT d.id FROM drafts d WHERE d.challenge_id = c.id AND d.user_id = $1) AS my_draft_id,
         (SELECT d.status FROM drafts d WHERE d.challenge_id = c.id AND d.user_id = $1) AS my_draft_status
  FROM challenges c
  JOIN game_modes m ON m.slug = c.mode_slug
  JOIN users cu ON cu.id = c.challenger_id
  JOIN users ou ON ou.id = c.opponent_id`;

// The opponent does not see a challenge until the challenger has finished their lineup
const VISIBLE = `(c.challenger_id = $1 OR (c.opponent_id = $1 AND c.status IN ('invited', 'accepted', 'complete')))`;

// POST /api/challenges  { friendId, modeSlug, wager }
// Starts a challenge. The challenger drafts first, from a pool made now. The wager is held right away.
challengesRouter.post("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const friendId = Number(req.body?.friendId);
  const slug = String(req.body?.modeSlug ?? "");
  const wager = Number(req.body?.wager ?? 0);
  if (!Number.isInteger(friendId) || !Number.isInteger(wager) || wager < 0) {
    return res.status(400).json({ error: "Bad challenge." });
  }
  try {
    if (!(await areFriends(me, friendId))) return res.status(403).json({ error: "You can only challenge friends." });

    const { rows: modes } = await pool.query("SELECT * FROM game_modes WHERE slug = $1", [slug]);
    const mode = modes[0];
    if (!mode) return res.status(404).json({ error: "That game mode does not exist." });
    const { rows: friends } = await pool.query("SELECT best_trophies FROM users WHERE id = $1", [friendId]);
    if (req.user.best_trophies < mode.unlock_trophies) {
      return res.status(403).json({ error: "You have not unlocked that game mode." });
    }
    if (!friends[0] || friends[0].best_trophies < mode.unlock_trophies) {
      return res.status(403).json({ error: "Your friend has not unlocked that game mode yet." });
    }

    const { rows: active } = await pool.query(
      "SELECT count(*)::int AS n FROM challenges WHERE challenger_id = $1 AND status IN ('drafting', 'invited', 'accepted')",
      [me]
    );
    if (active[0].n >= MAX_ACTIVE) {
      return res.status(409).json({ error: `You can have ${MAX_ACTIVE} open challenges at a time.` });
    }

    // Build the pool both players will draft from
    let season: number | null = null;
    let cards: PoolRow[] | null = null;
    for (let attempt = 0; attempt < 5 && !cards; attempt++) {
      if (mode.min_season === mode.max_season) season = mode.min_season;
      else if (mode.random_season) {
        season = mode.min_season + Math.floor(Math.random() * (mode.max_season - mode.min_season + 1));
      }
      const candidate = await buildPool(season ?? mode.min_season, season ?? mode.max_season, mode.allowed_tiers);
      if (canFillLineup(candidate, mode.budget)) cards = candidate;
    }
    if (!cards) return res.status(500).json({ error: "Could not build a draft pool." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (wager > 0) {
        const paid = await client.query("UPDATE users SET tokens = tokens - $1 WHERE id = $2 AND tokens >= $1", [
          wager,
          me,
        ]);
        if (paid.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(402).json({ error: "You do not have enough tokens for that wager." });
        }
      }
      const { rows: created } = await client.query(
        "INSERT INTO challenges (challenger_id, opponent_id, mode_slug, wager, status) VALUES ($1, $2, $3, $4, 'drafting') RETURNING id",
        [me, friendId, slug, wager]
      );
      const challengeId = created[0].id;
      const { rows: draft } = await client.query(
        "INSERT INTO drafts (user_id, mode_slug, season, entry_fee, challenge_id) VALUES ($1, $2, $3, 0, $4) RETURNING id",
        [me, slug, season, challengeId]
      );
      await client.query(
        `INSERT INTO draft_cards (draft_id, player_id, season, position_group, cost, tier)
         SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::int[], $6::text[])`,
        [
          draft[0].id,
          cards.map((c) => c.player_id),
          cards.map((c) => c.season),
          cards.map((c) => c.position_group),
          cards.map((c) => c.cost),
          cards.map((c) => c.tier),
        ]
      );
      await client.query("COMMIT");
      res.status(201).json({ challenge_id: challengeId, draft_id: draft[0].id });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start the challenge." });
  }
});

// GET /api/challenges -> your recent challenges
challengesRouter.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    const { rows } = await pool.query(
      `${CHALLENGE_SELECT}
       WHERE ${VISIBLE} AND c.status IN ('drafting', 'invited', 'accepted', 'complete')
       ORDER BY c.id DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load challenges." });
  }
});

// GET /api/challenges/:id -> one challenge. The lineups and scores appear once it is complete.
challengesRouter.get("/:id", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad challenge id." });
  try {
    const { rows } = await pool.query(`${CHALLENGE_SELECT} WHERE c.id = $2 AND ${VISIBLE}`, [req.user.id, id]);
    if (!rows[0]) return res.status(404).json({ error: "Challenge not found." });
    const { rows: details } = await pool.query("SELECT details FROM challenges WHERE id = $1", [id]);
    res.json({ ...rows[0], slots: details[0].details?.slots ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the challenge." });
  }
});

// Runs a change on one challenge inside a transaction, with the row locked
async function withChallenge(
  id: number,
  fn: (client: any, challenge: any) => Promise<{ code: number; body: object }>
): Promise<{ code: number; body: object }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM challenges WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return { code: 404, body: { error: "Challenge not found." } };
    }
    const result = await fn(client, rows[0]);
    await client.query(result.code < 300 ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// POST /api/challenges/:id/accept -> the friend pays the wager and gets the same pool to draft from
challengesRouter.post("/:id/accept", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad challenge id." });
  try {
    const out = await withChallenge(id, async (client, c) => {
      if (c.opponent_id !== me || c.status !== "invited") {
        return { code: 409, body: { error: "You cannot accept this challenge." } };
      }
      const { rows: modes } = await client.query("SELECT unlock_trophies FROM game_modes WHERE slug = $1", [c.mode_slug]);
      if (req.user!.best_trophies < modes[0].unlock_trophies) {
        return { code: 403, body: { error: "You have not unlocked that game mode yet." } };
      }
      if (c.wager > 0) {
        const paid = await client.query("UPDATE users SET tokens = tokens - $1 WHERE id = $2 AND tokens >= $1", [
          c.wager,
          me,
        ]);
        if (paid.rowCount === 0) return { code: 402, body: { error: `You need ${c.wager} tokens to accept.` } };
      }
      const { rows: theirs } = await client.query(
        "SELECT id, season FROM drafts WHERE challenge_id = $1 AND user_id = $2",
        [id, c.challenger_id]
      );
      const { rows: mine } = await client.query(
        "INSERT INTO drafts (user_id, mode_slug, season, entry_fee, challenge_id) VALUES ($1, $2, $3, 0, $4) RETURNING id",
        [me, c.mode_slug, theirs[0].season, id]
      );
      // The same pool, with every slot empty
      await client.query(
        `INSERT INTO draft_cards (draft_id, player_id, season, position_group, cost, tier)
         SELECT $1, player_id, season, position_group, cost, tier FROM draft_cards WHERE draft_id = $2`,
        [mine[0].id, theirs[0].id]
      );
      await client.query("UPDATE challenges SET status = 'accepted', accepted_at = now() WHERE id = $1", [id]);
      return { code: 200, body: { draft_id: mine[0].id } };
    });
    res.status(out.code).json(out.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not accept the challenge." });
  }
});

// Gives wagers back and removes the unfinished lineups
async function refundAndClose(client: any, c: any, status: "declined" | "cancelled", refundOpponent: boolean) {
  if (c.wager > 0) {
    await client.query("UPDATE users SET tokens = tokens + $1 WHERE id = $2", [c.wager, c.challenger_id]);
    if (refundOpponent) await client.query("UPDATE users SET tokens = tokens + $1 WHERE id = $2", [c.wager, c.opponent_id]);
  }
  await client.query("DELETE FROM drafts WHERE challenge_id = $1 AND status = 'open'", [c.id]);
  await client.query("UPDATE challenges SET status = $1 WHERE id = $2", [status, c.id]);
}

// POST /api/challenges/:id/decline -> the friend says no; the challenger gets the wager back
challengesRouter.post("/:id/decline", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad challenge id." });
  try {
    const out = await withChallenge(id, async (client, c) => {
      if (c.opponent_id !== req.user!.id || c.status !== "invited") {
        return { code: 409, body: { error: "You cannot decline this challenge." } };
      }
      await refundAndClose(client, c, "declined", false);
      return { code: 200, body: { ok: true } };
    });
    res.status(out.code).json(out.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not decline the challenge." });
  }
});

// POST /api/challenges/:id/cancel -> the challenger backs out.
// After the friend accepted, this only works once they have had 24 hours to finish drafting.
challengesRouter.post("/:id/cancel", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad challenge id." });
  try {
    const out = await withChallenge(id, async (client, c) => {
      if (c.challenger_id !== req.user!.id) return { code: 403, body: { error: "Only the challenger can cancel." } };
      if (c.status === "drafting" || c.status === "invited") {
        await refundAndClose(client, c, "cancelled", false);
        return { code: 200, body: { ok: true } };
      }
      if (c.status === "accepted") {
        const { rows } = await client.query(
          `SELECT (accepted_at <= now() - interval '${FORFEIT_AFTER}') AS late FROM challenges WHERE id = $1`,
          [id]
        );
        if (!rows[0].late) {
          return { code: 409, body: { error: "Your friend has 24 hours to finish drafting before you can cancel." } };
        }
        await refundAndClose(client, c, "cancelled", true);
        return { code: 200, body: { ok: true } };
      }
      return { code: 409, body: { error: "This challenge is already over." } };
    });
    res.status(out.code).json(out.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not cancel the challenge." });
  }
});