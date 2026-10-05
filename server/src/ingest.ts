import { readFileSync } from "node:fs";
import { pool } from "./db.js";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function ingestGames(): Promise<number> {
  const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(schema);

  const res = await fetch(SCOREBOARD_URL);
  if (!res.ok) throw new Error(`Scoreboard request failed: ${res.status}`);
  const data = await res.json();
  const events: any[] = data.events ?? [];

  for (const ev of events) {
    const competitors = ev.competitions[0].competitors;
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");

    await pool.query(
      `INSERT INTO games (id, home_team, away_team, home_score, away_score, status, start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         home_score = EXCLUDED.home_score,
         away_score = EXCLUDED.away_score,
         status = EXCLUDED.status`,
      [
        ev.id,
        home.team.displayName,
        away.team.displayName,
        Number(home.score),
        Number(away.score),
        ev.status.type.description,
        ev.date,
      ]
    );
  }
  return events.length;
}