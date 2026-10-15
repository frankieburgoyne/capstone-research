-- Up Migration
-- Only completed seasons are used in game modes (the current season is partial).
UPDATE game_modes SET max_season = 2025 WHERE max_season = 2026;

-- With token prices from 1 to 100, a gold card costs at least 80 and an elite card at least 95,
-- so the top two budgets had to rise or those modes could not be drafted at all.
UPDATE game_modes SET budget = 800 WHERE slug = 'legends';
UPDATE game_modes SET budget = 880 WHERE slug = 'all-stars';

-- One draft = one attempt at building a lineup in a game mode.
CREATE TABLE drafts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode_slug TEXT NOT NULL REFERENCES game_modes(slug),
  season INT, -- set when the draft uses a single season, otherwise empty
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
  total_cost INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);
-- A player can have only one open draft per mode, so a bad pool cannot be re-rolled by starting over.
CREATE UNIQUE INDEX drafts_one_open ON drafts (user_id, mode_slug) WHERE status = 'open';

-- The cards offered in a draft (the pool). slot is filled in when the lineup is submitted.
CREATE TABLE draft_cards (
  draft_id INT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  season INT NOT NULL,
  position_group TEXT NOT NULL,
  cost INT NOT NULL,
  tier TEXT NOT NULL,
  slot TEXT,
  PRIMARY KEY (draft_id, player_id, season)
);
CREATE UNIQUE INDEX draft_cards_slot ON draft_cards (draft_id, slot) WHERE slot IS NOT NULL;

-- Down Migration
DROP TABLE draft_cards;
DROP TABLE drafts;
UPDATE game_modes SET budget = 850 WHERE slug = 'all-stars';
UPDATE game_modes SET budget = 700 WHERE slug = 'legends';
UPDATE game_modes SET max_season = 2026 WHERE max_season = 2025;