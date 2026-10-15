import { pool } from "./db.js";

const BASE = "https://api.nfldata.org";
const FIRST_SEASON = 1999;
const LAST_SEASON = 2026;
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Which API position names belong to which card type.
// Card types: QB, RB, WR, TE, K, DL (defensive line), LB, DB.
// ---------------------------------------------------------------------------
const GROUP_BY_POSITION: Record<string, string> = {
  QB: "QB",
  RB: "RB", FB: "RB", HB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DE: "DL", DT: "DL", NT: "DL", DL: "DL",
  LB: "LB", OLB: "LB", ILB: "LB", MLB: "LB",
  CB: "DB", S: "DB", SS: "DB", FS: "DB", DB: "DB", SAF: "DB",
};

// ---------------------------------------------------------------------------
// Scoring for positions the dataset does not score (it gives 0 to them).
// Offense (QB, RB, WR, TE) uses the dataset's own fantasy_points_ppr.
// To change a point value, edit it here and run the import again.
// ---------------------------------------------------------------------------
function defensePoints(r: any): number {
  return (
    1 * num(r.def_tackles_solo) +
    0.5 * num(r.def_tackle_assists) +
    1 * num(r.def_tackles_for_loss) +
    4 * num(r.def_sacks) +
    1 * num(r.def_qb_hits) +
    6 * num(r.def_interceptions) +
    3 * num(r.def_fumbles_forced) +
    2 * num(r.fumble_recovery_opp) +
    2 * num(r.def_pass_defended) +
    6 * num(r.def_tds) +
    2 * num(r.def_safeties)
  );
}

function kickerPoints(r: any): number {
  const shortFg =
    num(r.fg_made_0_19) + num(r.fg_made_20_29) + num(r.fg_made_30_39); // 3 points each
  const midFg = num(r.fg_made_40_49); // 4 points each
  const longFg = num(r.fg_made_50_59) + num(r.fg_made_60_); // 5 points each
  return 3 * shortFg + 4 * midFg + 5 * longFg + 1 * num(r.pat_made) - 1 * num(r.fg_missed);
}

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

// New columns for defense and kickers. Safe to run every time.
const ADD_COLUMNS = `
ALTER TABLE cards ADD COLUMN IF NOT EXISTS position_group TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_tackles_solo INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_tackle_assists INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_tackles_for_loss INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_sacks DOUBLE PRECISION;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_qb_hits INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_interceptions INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_pass_defended INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_fumbles_forced INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS def_tds INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS fg_made INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS fg_att INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS fg_long INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pat_made INT;
CREATE INDEX IF NOT EXISTS cards_season_group ON cards (season, position_group);
`;

const COLUMNS = [
  "player_id", "season", "name", "position", "position_group", "team", "headshot_url", "season_type",
  "games", "passing_yards", "passing_tds", "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds",
  "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_qb_hits",
  "def_interceptions", "def_pass_defended", "def_fumbles_forced", "def_tds",
  "fg_made", "fg_att", "fg_long", "pat_made",
  "fantasy_points",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function num(v: unknown): number {
  return Number(v) || 0;
}

// Positions we did not recognize, counted so we can see them at the end
const unknownPositions = new Map<string, number>();

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

// Decide which card type a row is. Returns null for positions we do not use (linemen, etc.)
function groupFor(row: any): string | null {
  const pos = String(row.position ?? "").toUpperCase();
  if (GROUP_BY_POSITION[pos]) return GROUP_BY_POSITION[pos];
  // Fallback: the API also gives a broader group for defenders
  const g = String(row.position_group ?? "").toUpperCase();
  if (g === "DL" || g === "LB" || g === "DB") return g;
  unknownPositions.set(pos || "(none)", (unknownPositions.get(pos || "(none)") ?? 0) + 1);
  return null;
}

// Turn one API row into one database row (or null to skip it)
function toRecord(row: any): Record<string, any> | null {
  if (!row.player_id || !row.recent_team) return null;
  const group = groupFor(row);
  if (!group) return null;

  let points: number;
  if (group === "K") points = kickerPoints(row);
  else if (group === "DL" || group === "LB" || group === "DB") points = defensePoints(row);
  else points = num(row.fantasy_points_ppr);
  points = Math.round(points * 10) / 10;
  if (points <= 0) return null;

  return {
    player_id: row.player_id,
    season: num(row.season),
    name: row.player_display_name ?? row.player_name ?? row.player_id,
    position: row.position ?? group,
    position_group: group,
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
    def_tackles_solo: num(row.def_tackles_solo),
    def_tackle_assists: num(row.def_tackle_assists),
    def_tackles_for_loss: num(row.def_tackles_for_loss),
    def_sacks: num(row.def_sacks),
    def_qb_hits: num(row.def_qb_hits),
    def_interceptions: num(row.def_interceptions),
    def_pass_defended: num(row.def_pass_defended),
    def_fumbles_forced: num(row.def_fumbles_forced),
    def_tds: num(row.def_tds),
    fg_made: num(row.fg_made),
    fg_att: num(row.fg_att),
    fg_long: num(row.fg_long),
    pat_made: num(row.pat_made),
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

// Import every player for one season (no position filter), page by page
async function importSeason(season: number): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let offset = 0;
  while (true) {
    const page = await getJson(`/v1/stats/season?season=${season}&limit=${PAGE_SIZE}&offset=${offset}`);
    const data: any[] = page.data ?? [];

    const records = data
      .map((r) => toRecord(r))
      .filter((r): r is Record<string, any> => r !== null);
    await saveBatch(records);
    for (const r of records) counts.set(r.position_group, (counts.get(r.position_group) ?? 0) + 1);

    offset += data.length;
    if (data.length === 0 || offset >= (page.total ?? 0)) break;
  }
  return counts;
}

async function main() {
  // Usage: npm run import-cards            -> every season
  //        npm run import-cards -- 2023     -> one season
  //        npm run import-cards -- 2020 2023 -> a range
  const [a, b] = process.argv.slice(2).map(Number);
  const first = a || FIRST_SEASON;
  const last = b || a || LAST_SEASON;

  await pool.query(CREATE_TABLE);
  await pool.query(ADD_COLUMNS);

  const order = ["QB", "RB", "WR", "TE", "K", "DL", "LB", "DB"];
  let total = 0;
  for (let season = first; season <= last; season++) {
    const counts = await importSeason(season);
    const parts = order.map((g) => `${g} ${counts.get(g) ?? 0}`);
    total += [...counts.values()].reduce((x, y) => x + y, 0);
    console.log(`${season}: ${parts.join(", ")}`);
  }
  console.log(`Done. ${total} cards saved.`);
  if (unknownPositions.size > 0) {
    const list = [...unknownPositions.entries()].map(([k, v]) => `${k}: ${v}`).join(", ");
    console.log(`Rows skipped because the position is not a card type: ${list}`);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});