# Player Cards

A small web app where every card is one NFL player in one season (QB, RB, WR, TE, 1999 to 2026).
Pick a season, then a team, and see the players as cards with a photo, key stats, and a token value.

Live site: https://capstone-research-k4cn.onrender.com

## Stack

- **TypeScript** everywhere
- **React + Vite:** the web page
- **Node.js + Express:** the server and API
- **PostgreSQL on Neon:** the database
- **Render:** hosts the server and the built page
- **npm:** installs libraries

## How it works

1. A one-time import copies season stats from the nfldata.org API into the database.
2. The server reads cards from the database and calculates tokens.
3. The page shows season and team dropdowns and the cards.

Token value = season PPR fantasy points divided by 4 (minimum 1). Tiers: bronze under 30,
silver 30 to 54, gold 55 to 79, elite 80+. The formula is in `server/src/tokens.ts`.

## Run it locally

You need Node.js (version 20.6 or newer) and a free Neon database.

1. Copy `server/.env.example` to `server/.env` and put your Neon connection string in it.
2. In `server`: `npm install`, then `npm run import-cards` (takes a few minutes), then `npm run dev`.
3. In `client`: `npm install`, then `npm run dev`.
4. Open http://localhost:5173

## Deploy

Render builds the page and runs the server from this repo's `main` branch.
Build command: `cd client && npm install && npm run build && cd ../server && npm install --include=dev`
Start command: `cd server && npm start`
Environment variables: `DATABASE_URL` and `NODE_VERSION=22`.

## Notes

- Free hosting sleeps when idle, so the first visit can take about a minute.
- A player traded mid-season appears under one team, and playoff players may include playoff games.
- Stats come from nfldata.org, which is built on the open nflverse data. Credit to nflverse.
- Player photos are served from NFL.com and are not stored in this repo.
- The original ESPN-based milestone is preserved under the git tag `milestone-submitted`.

