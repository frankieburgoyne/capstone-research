-- Up Migration
-- The cards table. IF NOT EXISTS makes this safe on a database that already has it.
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

-- Down Migration
-- Deliberately does nothing: dropping the cards table would erase the imported data.
SELECT 1;