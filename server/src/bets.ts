import { Router } from "express";
import { pool } from "./db.js";
import { rollScore } from "./matchup.js";
import { oddsFor, probFirstBeatsSecond, probOver } from "./odds.js";

export const betsRouter = Router();

const SLATE_SIZE = 12; // bets on the board
const MAX_LEGS = 4; // most picks in one bet

type Snap = {
  name: string;
  position: string;
  team: string;
  season: number;
  headshot_url: string | null;
  points: number; // the card's season fantasy points
};
type Selection = { key: string; label: string; odds: number };
type OfferData = {
  kind: "h2h" | "over_under";
  title: string;
  cards: Snap[];
  line?: number;
  selections: Selection[];
};

const snap = (r: any): Snap => ({
  name: r.name,
  position: r.position,
  team: r.team,
  season: r.season,
  headshot_url: r.headshot_url,
  points: Number(r.fantasy_points),
});

// Builds a fresh board of bets from random cards
function buildOffers(rows: any[]): OfferData[] {
  const taken = new Set<number>();
  const h2h: OfferData[] = [];
  const overUnder: OfferData[] = [];

  // Head to head: two cards of the same type with similar points, so the bet is a real toss-up
  for (let i = 0; i < rows.length && h2h.length < SLATE_SIZE / 2; i++) {
    if (taken.has(i)) continue;
    const a = rows[i];
    const aPts = Number(a.fantasy_points);
    const j = rows.findIndex((b, k) => {
      if (k === i || taken.has(k)) return false;
      const ratio = Number(b.fantasy_points) / aPts;
      return b.position_group === a.position_group && b.player_id !== a.player_id && ratio >= 0.85 && ratio <= 1.18;
    });
    if (j === -1) continue;
    taken.add(i);
    taken.add(j);
    const b = rows[j];
    const p = probFirstBeatsSecond(aPts, Number(b.fantasy_points));
    h2h.push({
      kind: "h2h",
      title: "Who scores more on game day?",
      cards: [snap(a), snap(b)],
      selections: [
        { key: "a", label: a.name, odds: oddsFor(p) },
        { key: "b", label: b.name, odds: oddsFor(1 - p) },
      ],
    });
  }

  // Over/under: will one card beat a line set near its season total?
  const factors = [0.92, 0.96, 1, 1.04, 1.08];
  for (let i = 0; i < rows.length && overUnder.length < SLATE_SIZE - h2h.length; i++) {
    if (taken.has(i)) continue;
    taken.add(i);
    const r = rows[i];
    const pts = Number(r.fantasy_points);
    const line = Math.round(pts * factors[Math.floor(Math.random() * factors.length)] * 10) / 10;
    const p = probOver(pts, line);
    overUnder.push({
      kind: "over_under",
      title: `Will ${r.name} beat ${line}?`,
      cards: [snap(r)],
      line,
      selections: [
        { key: "over", label: `Over ${line}`, odds: oddsFor(p) },
        { key: "under", label: `Under ${line}`, odds: oddsFor(1 - p) },
      ],
    });
  }

  // Mix the two kinds together
  const board: OfferData[] = [];
  for (let i = 0; i < Math.max(h2h.length, overUnder.length); i++) {
    if (h2h[i]) board.push(h2h[i]);
    if (overUnder[i]) board.push(overUnder[i]);
  }
  return board;
}

// Makes a new board for the user. Unless force is true, it only does so when the board is empty.
async function makeSlate(userId: number, force: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [userId]); // one board build per user at a time
    if (!force) {
      const { rows } = await client.query("SELECT count(*)::int AS n FROM bet_offers WHERE user_id = $1", [userId]);
      if (rows[0].n > 0) {
        await client.query("COMMIT");
        return;
      }
    }
    const { rows: cards } = await client.query(
      `SELECT player_id, season, name, position, position_group, team, headshot_url, fantasy_points
       FROM cards
       WHERE position_group IS NOT NULL AND games >= 8 AND fantasy_points >= 40
       ORDER BY random()
       LIMIT 400`
    );
    await client.query("DELETE FROM bet_offers WHERE user_id = $1", [userId]);
    for (const offer of buildOffers(cards)) {
      await client.query("INSERT INTO bet_offers (user_id, kind, data) VALUES ($1, $2, $3)", [
        userId,
        offer.kind,
        JSON.stringify(offer),
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function loadBoard(userId: number) {
  const { rows: offers } = await pool.query(
    "SELECT id, data FROM bet_offers WHERE user_id = $1 ORDER BY id",
    [userId]
  );
  const { rows: bets } = await pool.query(
    `SELECT id, stake, odds, status, payout, legs, created_at
     FROM bets WHERE user_id = $1 ORDER BY id DESC LIMIT 10`,
    [userId]
  );
  return { offers: offers.map((o: any) => ({ id: o.id, ...o.data })), bets };
}

// GET /api/bets/slate -> the bets on the board plus your 10 most recent bets
betsRouter.get("/slate", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    await makeSlate(req.user.id, false);
    res.json(await loadBoard(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the bets." });
  }
});

// POST /api/bets/slate/refresh -> throws away the board and builds a new one
betsRouter.post("/slate/refresh", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  try {
    await makeSlate(req.user.id, true);
    res.json(await loadBoard(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not refresh the bets." });
  }
});

// POST /api/bets/place  { stake: 50, picks: [{ offer_id: 12, selection: "a" }, ...] }
// Takes the stake, plays out game day for every pick, and pays out if every pick wins.
// One pick is a single bet. Several picks make a parlay: all must win, and the odds multiply.
betsRouter.post("/place", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  const stake = Number(req.body?.stake);
  const picks = req.body?.picks;
  if (!Number.isInteger(stake) || stake < 1) {
    return res.status(400).json({ error: "Bet at least 1 token (whole numbers only)." });
  }
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > MAX_LEGS) {
    return res.status(400).json({ error: `Pick between 1 and ${MAX_LEGS} bets.` });
  }
  const ids: number[] = picks.map((p: any) => Number(p?.offer_id));
  if (ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "Bad picks." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Taking the offers off the board first means a double click cannot place the bet twice
    const taken = await client.query(
      "DELETE FROM bet_offers WHERE id = ANY($1::int[]) AND user_id = $2 RETURNING id, data",
      [ids, req.user.id]
    );
    if (taken.rowCount !== ids.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "One of those bets is no longer on the board. Refresh and try again." });
    }

    const paid = await client.query(
      "UPDATE users SET tokens = tokens - $1 WHERE id = $2 AND tokens >= $1",
      [stake, req.user.id]
    );
    if (paid.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: "You do not have enough tokens for that bet." });
    }

    // Play out each pick
    const legs: any[] = [];
    let combined = 1;
    let anyLost = false;
    let anyWon = false;
    for (const p of picks) {
      const offer: OfferData = taken.rows.find((r: any) => r.id === Number(p.offer_id)).data;
      const selection = offer.selections.find((s) => s.key === p.selection);
      if (!selection) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Bad pick." });
      }

      let outcome: "won" | "lost" | "push";
      let scores: number[];
      if (offer.kind === "h2h") {
        scores = [rollScore(offer.cards[0].points), rollScore(offer.cards[1].points)];
        const diff = selection.key === "a" ? scores[0] - scores[1] : scores[1] - scores[0];
        outcome = diff > 0 ? "won" : diff < 0 ? "lost" : "push";
      } else {
        scores = [rollScore(offer.cards[0].points)];
        const diff = selection.key === "over" ? scores[0] - offer.line! : offer.line! - scores[0];
        outcome = diff > 0 ? "won" : diff < 0 ? "lost" : "push";
      }
      if (outcome === "lost") anyLost = true;
      if (outcome === "won") anyWon = true;
      if (outcome !== "push") combined *= selection.odds; // a push leg counts as 1.00x
      legs.push({
        kind: offer.kind,
        title: offer.title,
        cards: offer.cards,
        line: offer.line ?? null,
        pick: selection.label,
        odds: selection.odds,
        outcome,
        scores,
      });
    }

    const status: "won" | "lost" | "push" = anyLost ? "lost" : anyWon ? "won" : "push";
    const odds = Math.round(combined * 100) / 100; // the odds the bet was placed at
    const payout = status === "won" ? Math.floor(stake * odds) : status === "push" ? stake : 0;
    if (payout > 0) {
      await client.query("UPDATE users SET tokens = tokens + $1 WHERE id = $2", [payout, req.user.id]);
    }
    const { rows } = await client.query(
      `INSERT INTO bets (user_id, stake, odds, status, payout, legs)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, stake, odds, status, payout, legs, created_at`,
      [req.user.id, stake, odds, status, payout, JSON.stringify(legs)]
    );
    await client.query("COMMIT");
    res.json({ bet: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not place the bet." });
  } finally {
    client.release();
  }
});