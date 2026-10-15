import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pool } from "./db.js";

const { rows } = await pool.query(
  "SELECT * FROM cards ORDER BY season, team, player_id"
);
const dir = path.join(homedir(), "nfl-archive", "_my-database");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `cards-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(rows));
console.log(`Saved ${rows.length} cards to ${file}`);
await pool.end();