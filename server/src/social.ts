import { Router } from "express";
import { pool } from "./db.js";

export const friendsRouter = Router();
export const messagesRouter = Router();

const low = (a: number, b: number) => Math.min(a, b);
const high = (a: number, b: number) => Math.max(a, b);

// Are these two users accepted friends?
export async function areFriends(a: number, b: number): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM friendships WHERE user_low = $1 AND user_high = $2 AND status = 'accepted'",
    [low(a, b), high(a, b)]
  );
  return rows.length > 0;
}

// GET /api/friends -> friends (with unread messages and head-to-head record), and pending requests
friendsRouter.get("/", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  try {
    const { rows: friends } = await pool.query(
      `SELECT u.id, u.display_name, u.trophies, u.best_trophies,
         (SELECT count(*)::int FROM messages m
            WHERE m.sender_id = u.id AND m.recipient_id = $1 AND m.read_at IS NULL) AS unread,
         (SELECT count(*)::int FROM challenges c WHERE c.status = 'complete' AND c.winner_id = $1
            AND ((c.challenger_id = $1 AND c.opponent_id = u.id) OR (c.opponent_id = $1 AND c.challenger_id = u.id))) AS wins,
         (SELECT count(*)::int FROM challenges c WHERE c.status = 'complete' AND c.winner_id = u.id
            AND ((c.challenger_id = $1 AND c.opponent_id = u.id) OR (c.opponent_id = $1 AND c.challenger_id = u.id))) AS losses,
         (SELECT count(*)::int FROM challenges c WHERE c.status = 'complete' AND c.winner_id IS NULL
            AND ((c.challenger_id = $1 AND c.opponent_id = u.id) OR (c.opponent_id = $1 AND c.challenger_id = u.id))) AS draws
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
       WHERE (f.user_low = $1 OR f.user_high = $1) AND f.status = 'accepted'
       ORDER BY u.trophies DESC, u.display_name`,
      [me]
    );
    const { rows: pending } = await pool.query(
      `SELECT u.id, u.display_name, u.trophies, (f.requested_by = $1) AS sent_by_me
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
       WHERE (f.user_low = $1 OR f.user_high = $1) AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [me]
    );
    res.json({
      friends,
      incoming: pending.filter((p: any) => !p.sent_by_me),
      outgoing: pending.filter((p: any) => p.sent_by_me),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load friends." });
  }
});

// GET /api/friends/summary -> the numbers for the badge in the nav bar
friendsRouter.get("/summary", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM messages WHERE recipient_id = $1 AND read_at IS NULL) AS unread_messages,
         (SELECT count(*)::int FROM friendships WHERE status = 'pending' AND requested_by <> $1
            AND (user_low = $1 OR user_high = $1)) AS friend_requests,
         (SELECT count(*)::int FROM challenges WHERE opponent_id = $1 AND status = 'invited') AS challenge_invites,
         (SELECT count(*)::int FROM challenges WHERE opponent_id = $1 AND status = 'accepted') AS challenges_to_draft`,
      [me]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the summary." });
  }
});

// GET /api/friends/search?q=fra -> players whose name starts with the text
friendsRouter.get("/search", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  const me = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.display_name, u.trophies,
              CASE WHEN f.status IS NULL THEN 'none'
                   WHEN f.status = 'accepted' THEN 'friend'
                   WHEN f.requested_by = $1 THEN 'sent'
                   ELSE 'received' END AS relation
       FROM users u
       LEFT JOIN friendships f ON f.user_low = LEAST(u.id, $1) AND f.user_high = GREATEST(u.id, $1)
       WHERE u.id <> $1 AND u.display_name ILIKE $2 || '%'
       ORDER BY u.display_name
       LIMIT 10`,
      [me, q.replace(/[\\%_]/g, "\\$&")]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not search." });
  }
});

// POST /api/friends/request  { userId }
friendsRouter.post("/request", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const other = Number(req.body?.userId);
  if (!Number.isInteger(other) || other === me) return res.status(400).json({ error: "Pick another player." });
  try {
    const { rows: users } = await pool.query("SELECT id FROM users WHERE id = $1", [other]);
    if (!users[0]) return res.status(404).json({ error: "That player does not exist." });

    const { rows: existing } = await pool.query(
      "SELECT status, requested_by FROM friendships WHERE user_low = $1 AND user_high = $2",
      [low(me, other), high(me, other)]
    );
    const row = existing[0];
    if (row?.status === "accepted") return res.status(409).json({ error: "You are already friends." });
    if (row && row.requested_by === me) return res.status(409).json({ error: "You already sent a request." });
    if (row) {
      // They already asked you, so this makes you friends
      await pool.query("UPDATE friendships SET status = 'accepted' WHERE user_low = $1 AND user_high = $2", [
        low(me, other),
        high(me, other),
      ]);
      return res.json({ status: "friends" });
    }
    const { rows: count } = await pool.query(
      "SELECT count(*)::int AS n FROM friendships WHERE requested_by = $1 AND status = 'pending'",
      [me]
    );
    if (count[0].n >= 20) return res.status(429).json({ error: "You have too many pending requests." });
    await pool.query(
      "INSERT INTO friendships (user_low, user_high, requested_by, status) VALUES ($1, $2, $3, 'pending')",
      [low(me, other), high(me, other), me]
    );
    res.json({ status: "sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send the request." });
  }
});

// POST /api/friends/respond  { userId, accept: true | false }
friendsRouter.post("/respond", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const other = Number(req.body?.userId);
  if (!Number.isInteger(other)) return res.status(400).json({ error: "Bad request." });
  try {
    const where = "user_low = $1 AND user_high = $2 AND status = 'pending' AND requested_by = $3";
    const args = [low(me, other), high(me, other), other];
    const result = req.body?.accept
      ? await pool.query(`UPDATE friendships SET status = 'accepted' WHERE ${where}`, args)
      : await pool.query(`DELETE FROM friendships WHERE ${where}`, args);
    if (result.rowCount === 0) return res.status(404).json({ error: "That request is gone." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not answer the request." });
  }
});

// DELETE /api/friends/:userId -> unfriend, or cancel a request you sent
friendsRouter.delete("/:userId", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const other = Number(req.params.userId);
  if (!Number.isInteger(other)) return res.status(400).json({ error: "Bad request." });
  try {
    // Challenges hold tokens, so they have to be finished or cancelled first
    const { rows: active } = await pool.query(
      `SELECT 1 FROM challenges
       WHERE status IN ('drafting', 'invited', 'accepted')
         AND ((challenger_id = $1 AND opponent_id = $2) OR (challenger_id = $2 AND opponent_id = $1))
       LIMIT 1`,
      [me, other]
    );
    if (active[0]) return res.status(409).json({ error: "Finish or cancel your open challenges with them first." });
    await pool.query("DELETE FROM friendships WHERE user_low = $1 AND user_high = $2", [
      low(me, other),
      high(me, other),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove the friend." });
  }
});

// GET /api/messages/:friendId?after=12 -> the conversation (or just the new messages after id 12)
// Reading it marks the friend's messages as read.
messagesRouter.get("/:friendId", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const friend = Number(req.params.friendId);
  const after = Number(req.query.after ?? 0) || 0;
  if (!Number.isInteger(friend)) return res.status(400).json({ error: "Bad request." });
  try {
    if (!(await areFriends(me, friend))) return res.status(403).json({ error: "You can only message friends." });
    const { rows: who } = await pool.query("SELECT id, display_name, trophies FROM users WHERE id = $1", [friend]);
    const { rows: messages } = await pool.query(
      `SELECT * FROM (
         SELECT id, sender_id, body, created_at FROM messages
         WHERE id > $3 AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
         ORDER BY id DESC LIMIT 100
       ) recent ORDER BY id`,
      [me, friend, after]
    );
    await pool.query(
      "UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL",
      [me, friend]
    );
    res.json({ friend: who[0], messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the messages." });
  }
});

// POST /api/messages/:friendId  { body }
messagesRouter.post("/:friendId", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const me = req.user.id;
  const friend = Number(req.params.friendId);
  const body = String(req.body?.body ?? "").trim();
  if (!Number.isInteger(friend)) return res.status(400).json({ error: "Bad request." });
  if (body.length < 1 || body.length > 500) {
    return res.status(400).json({ error: "Messages are 1 to 500 characters." });
  }
  try {
    if (!(await areFriends(me, friend))) return res.status(403).json({ error: "You can only message friends." });
    const { rows: recent } = await pool.query(
      "SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'",
      [me]
    );
    if (recent[0].n >= 20) return res.status(429).json({ error: "Slow down a little." });
    const { rows } = await pool.query(
      "INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id, sender_id, body, created_at",
      [me, friend, body]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send the message." });
  }
});