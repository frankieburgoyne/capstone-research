# Draft Day (fantasy football token card game)

A test bed for our capstone: a TypeScript web game where players draft lineups of football "player-season" cards, play matchups, bet tokens, and challenge friends. It is not the real project repo. Everything runs on free tiers.

Link to site: https://capstone-research-k4cn.onrender.com

## Stack

| Part | Tech |
| --- | --- |
| Client | React 19 + Vite + React Router 7 |
| Server | Node 22 + Express 5, run with tsx |
| Database | Postgres on Neon (free) |
| Hosting | Render free tier, auto-deploys from `main` |
| Language | TypeScript |

## Features

- **Cards:** every card is one player-season, with a cost and tier (bronze, silver, gold, elite) set by percentile rank within its season and position group.
- **Accounts:** register, log in, session cookies, bcrypt-hashed passwords.
- **Game modes:** unlocked by trophies. Each has an entry fee, a lineup cap, allowed tiers, and a season range.
- **Drafting:** pick 9 cards (QB, RB, 2 WR, TE, K, DL, LB, DB) from a random pool under the cap.
- **Matchups vs computer:** on game day each card scores its season fantasy points times a random 0.8 to 1.2. A win pays 2x the entry fee and gives trophies. A loss forfeits the fee and loses trophies. A draw returns the fee.
- **Daily bonus:** +25 tokens every 24 hours.
- **Betting:** head-to-head, over/under, and parlays on generated matchups. 8% house edge.
- **Friends:** search by display name, send and accept requests, a friends list ranked by trophies, and your win-loss record against each friend.
- **Messages:** chat with friends (the client polls every 3 seconds). Unread badge in the nav.
- **Friend challenges:** you and a friend draft from the same pool, then your lineups play. Optional token wager: the winner takes both, a draw refunds both. No trophy changes. Declining or cancelling refunds. A challenger can cancel an accepted challenge after 24 hours.
- **Look and feel:** dark navy theme with slate panels, bright blue actions, cyan stats, green positives. Hover and press effects, animated token/trophy counters, and toasts. Motion is turned off for users who prefer reduced motion.

## Project layout

```
client/            React app
  src/
    App.tsx        nav, routes, social notification polling
    theme.css      all styles and color tokens
    *Page.tsx      one file per screen
server/
  migrations/      node-pg-migrate SQL files (001 ... 010)
  src/
    index.ts       Express setup and routes
    drafts.ts      drafting and submit
    matchup.ts     scoring rules
    bets.ts        betting, odds.ts has the odds math
    social.ts      friends and messages
    challenges.ts  friend challenges
    challenge-resolve.ts  plays a challenge and pays out
```