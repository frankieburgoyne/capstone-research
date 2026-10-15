// What happens when someone locks in a lineup for a friend challenge.
import type { PoolClient } from "pg";
import { SLOTS, rollScore } from "./matchup.js";

export class ChallengeInactiveError extends Error {}

type Lineup = Record<string, any>;

// Called inside the submit transaction, after the lineup has been saved.
// - The challenger finishing their lineup sends the invite to the friend.
// - The friend finishing theirs plays the match and pays the winner.
export async function onChallengeDraftSubmitted(
  client: PoolClient,
  challengeId: number,
  userId: number
): Promise<void> {
  const { rows } = await client.query("SELECT * FROM challenges WHERE id = $1 FOR UPDATE", [challengeId]);
  const c = rows[0];
  if (!c) throw new ChallengeInactiveError();

  if (userId === c.challenger_id && c.status === "drafting") {
    await client.query("UPDATE challenges SET status = 'invited' WHERE id = $1", [challengeId]);
    return;
  }
  if (userId !== c.opponent_id || c.status !== "accepted") throw new ChallengeInactiveError();

  // Both lineups, with each card's season points
  const { rows: picks } = await client.query(
    `SELECT d.user_id, dc.slot, dc.tier, dc.season,
            c.name, c.position, c.team, c.headshot_url, c.fantasy_points
     FROM drafts d
     JOIN draft_cards dc ON dc.draft_id = d.id AND dc.slot IS NOT NULL
     JOIN cards c ON c.player_id = dc.player_id AND c.season = dc.season
     WHERE d.challenge_id = $1`,
    [challengeId]
  );
  const lineups: Record<number, Lineup> = { [c.challenger_id]: {}, [c.opponent_id]: {} };
  for (const p of picks) lineups[p.user_id][p.slot] = p;
  for (const { slot } of SLOTS) {
    if (!lineups[c.challenger_id][slot] || !lineups[c.opponent_id][slot]) {
      throw new Error("A lineup in this challenge is incomplete.");
    }
  }

  const show = (p: any, score: number) => ({
    name: p.name,
    position: p.position,
    team: p.team,
    season: p.season,
    tier: p.tier,
    fantasy_points: Number(p.fantasy_points),
    score,
  });
  const slots = SLOTS.map(({ slot }) => ({
    slot,
    challenger: show(lineups[c.challenger_id][slot], rollScore(Number(lineups[c.challenger_id][slot].fantasy_points))),
    opponent: show(lineups[c.opponent_id][slot], rollScore(Number(lineups[c.opponent_id][slot].fantasy_points))),
  }));
  const round = (n: number) => Math.round(n * 10) / 10;
  const challengerTotal = round(slots.reduce((sum, s) => sum + s.challenger.score, 0));
  const opponentTotal = round(slots.reduce((sum, s) => sum + s.opponent.score, 0));
  const winnerId =
    challengerTotal > opponentTotal ? c.challenger_id : challengerTotal < opponentTotal ? c.opponent_id : null;

  // The wager was held when each player joined. The winner takes both; a draw gives each back their own.
  if (c.wager > 0) {
    if (winnerId) {
      await client.query("UPDATE users SET tokens = tokens + $1 WHERE id = $2", [c.wager * 2, winnerId]);
    } else {
      await client.query("UPDATE users SET tokens = tokens + $1 WHERE id = ANY($2::int[])", [
        c.wager,
        [c.challenger_id, c.opponent_id],
      ]);
    }
  }
  await client.query(
    `UPDATE challenges
     SET status = 'complete', winner_id = $1, challenger_total = $2, opponent_total = $3, details = $4
     WHERE id = $5`,
    [winnerId, challengerTotal, opponentTotal, JSON.stringify({ slots }), challengeId]
  );
}