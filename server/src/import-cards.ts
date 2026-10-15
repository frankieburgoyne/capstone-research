import { pool } from "./db.js";

const BASE = "https://api.nfldata.org";
const POSITIONS = ["QB", "RB", "WR", "TE"];
const FIRST_SEASON = 1999;
const LAST_SEASON = 2026;
const PAGE_SIZE = 100;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS cards (
  player_id TEXT NOT NULL,
  season INT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  team TEXT NOT NULL,
  headshot_url TEXT,
  season_type TEXT,
  games INT,
  passing_yards INT,
  passing_tds INT,
  rushing_yards INT,
  rushing_tds INT,
  receptions INT,
  receiving_yards INT,
  receiving_tds INT,
  fantasy_points DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (player_id, season)
);
CREATE INDEX IF NOT EXISTS cards_season_team ON cards (season, team);
`;

const COLUMNS = [
  "player_id", "season", "name", "position", "team", "headshot_url", "season_type",
  "games", "passing_yards", "passing_tds", "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds", "fantasy_points",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const num = (v: unknown): number => Number(v) || 0;

// Fetch with retries. Waits between requests to stay under 100 requests/minute.
async function getJson(path: string): Promise<any> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(BASE + path, { signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        await sleep(700);
        return await res.json();
      }
      console.log(`  HTTP ${res.status}, retrying (${attempt}/5)...`);
    } catch (err) {
      console.log(`  Request failed (${(err as Error).message}), retrying (${attempt}/5)...`);
    }
    await sleep(3000 * attempt);
  }
  throw new Error(`Giving up on ${path}`);
}

// Turn one API row into one database row (or null to skip it)
function toRecord(row: any, position: string): Record<string, any> | null {
  const points = Math.round(num(row.fantasy_points_ppr) * 10) / 10;
  if (!row.player_id || !row.recent_team || points <= 0) return null;
  return {
    player_id: row.player_id,
    season: num(row.season),
    name: row.player_display_name ?? row.player_name ?? row.player_id,
    position: row.position ?? position,
    team: row.recent_team,
    headshot_url: row.headshot_url ?? null,
    season_type: row.season_type ?? null,
    games: num(row.games),
    passing_yards: num(row.passing_yards),
    passing_tds: num(row.passing_tds),
    rushing_yards: num(row.rushing_yards),
    rushing_tds: num(row.rushing_tds),
    receptions: num(row.receptions),
    receiving_yards: num(row.receiving_yards),
    receiving_tds: num(row.receiving_tds),
    fantasy_points: points,
  };
}

// Save up to 100 cards with one database call (insert, or update if it exists)
async function saveBatch(records: Record<string, any>[]) {
  if (records.length === 0) return;

  const unique = new Map<string, Record<string, any>>();
  for (const r of records) unique.set(`${r.player_id}-${r.season}`, r);
  const rows = [...unique.values()];

  const values: any[] = [];
  const tuples = rows.map((r, i) => {
    for (const col of COLUMNS) values.push(r[col]);
    const params = COLUMNS.map((_, j) => `$${i * COLUMNS.length + j + 1}`);
    return `(${params.join(", ")})`;
  });

  const updates = COLUMNS.filter((c) => c !== "player_id" && c !== "season")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  await pool.query(
    `INSERT INTO cards (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT (player_id, season) DO UPDATE SET ${updates}`,
    values
  );
}

async function importSeasonPosition(season: number, position: string): Promise<number> {
  let offset = 0;
  let saved = 0;
  while (true) {
    const page = await getJson(
      `/v1/stats/season?season=${season}&position=${position}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    const data: any[] = page.data ?? [];

    // Safety check 1: a working filter returns a few hundred rows at most
    if ((page.total ?? 0) > 500) {
      throw new Error(
        `The position filter seems to be ignored (${page.total} rows for ${position} in ${season}). Stop and paste this message to Claude.`
      );
    }

    // Safety check 2: stop if most rows clearly belong to another position
    const wrong = data.filter((r) => r.position && r.position !== position);
    if (wrong.length > data.length / 2) {
      throw new Error(
        `Most rows are not ${position} (for example ${wrong[0].position}). Stop and paste this message to Claude.`
      );
    }

    // Keep rows that match, or that have no position at all
    const usable = data.filter((r) => !r.position || r.position === position);
    const noPosition = usable.filter((r) => !r.position).length;
    if (noPosition > 0) {
      console.log(`  note: ${season} ${position}: ${noPosition} row(s) had no position, saved as ${position}`);
    }
    if (wrong.length > 0) {
      console.log(`  note: ${season} ${position}: skipped ${wrong.length} row(s) listed under another position`);
    }

    const records = usable
      .map((r) => toRecord(r, position))
      .filter((r): r is Record<string, any> => r !== null);
    await saveBatch(records);
    saved += records.length;

    offset += data.length;
    if (data.length === 0 || offset >= (page.total ?? 0)) break;
  }
  return saved;
}

async function main() {
  // Usage: npm run import-cards            -> every season
  //        npm run import-cards -- 2023     -> one season
  //        npm run import-cards -- 2020 2023 -> a range
  const [a, b] = process.argv.slice(2).map(Number);
  const first = a || FIRST_SEASON;
  const last = b || a || LAST_SEASON;

  await pool.query(CREATE_TABLE);

  let total = 0;
  for (let season = first; season <= last; season++) {
    const parts: string[] = [];
    for (const position of POSITIONS) {
      const n = await importSeasonPosition(season, position);
      parts.push(`${position} ${n}`);
      total += n;
    }
    console.log(`${season}: ${parts.join(", ")}`);
  }
  console.log(`Done. ${total} cards saved.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});