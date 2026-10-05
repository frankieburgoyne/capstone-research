import { ingestGames } from "./ingest.js";
import { pool } from "./db.js";

const count = await ingestGames();
console.log(`Ingested ${count} games`);
await pool.end();