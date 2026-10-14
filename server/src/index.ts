import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { pool } from "./db.js";
import { ensureFresh } from "./ingest.js";

const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer);

// GET /api/games: list games with how many users picked each side
app.get("/api/games", async (_req, res) => {
  await ensureFresh();
  const { rows } = await pool.query(`
    SELECT g.*,
      COUNT(p.*) FILTER (WHERE p.pick = 'home')::int AS home_picks,
      COUNT(p.*) FILTER (WHERE p.pick = 'away')::int AS away_picks
    FROM games g
    LEFT JOIN picks p ON p.game_id = g.id
    GROUP BY g.id
    ORDER BY g.start_time
  `);
  res.json(rows);
});

// POST /api/picks: a user submits a pick
app.post("/api/picks", async (req, res) => {
  const { gameId, username, pick } = req.body;
  if (!gameId || !username?.trim() || !["home", "away"].includes(pick)) {
    return res
      .status(400)
      .json({ error: "gameId, username, and pick (home|away) are required" });
  }
  await pool.query(
    "INSERT INTO picks (game_id, username, pick) VALUES ($1, $2, $3)",
    [gameId, username.trim(), pick]
  );
  io.emit("games-updated");
  res.status(201).json({ ok: true });
});

// GET /api/quote: hard-coded odds formula
app.get("/api/quote", (req, res) => {
  const wager = Number(req.query.wager);
  const side = req.query.side;
  if (!Number.isFinite(wager) || wager <= 0 || (side !== "home" && side !== "away")) {
    return res.status(400).json({ error: "wager (> 0) and side (home|away) required" });
  }
  const pHome = 0.55; // assumed home-field advantage
  const p = side === "home" ? pHome : 1 - pHome;
  const odds = (1 / p) * 0.95; // fair odds minus a 5% house cut
  res.json({
    odds: Math.round(odds * 100) / 100,
    payout: Math.round(wager * odds * 100) / 100,
  });
});

// Chat: broadcast every message to everyone connected
io.on("connection", (socket) => {
  socket.on("chat", (msg: { user: string; text: string }) => {
    io.emit("chat", msg);
  });
});

// In production, serve the built React page from this same server
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, () => console.log(`Server on port ${PORT}`));