-- Up Migration
-- Trophies decide which game modes a player can enter.
-- best_trophies is the highest the player has reached; modes unlock from it.
ALTER TABLE users ADD COLUMN trophies INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN best_trophies INT NOT NULL DEFAULT 0;

-- Tokens are no longer the draft budget, so new accounts start with a small amount.
ALTER TABLE users ALTER COLUMN tokens SET DEFAULT 100;

-- A game mode is a saved set of rules: which cards are in the pool,
-- how much a player can spend, and how many trophies unlock it.
CREATE TABLE game_modes (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  unlock_trophies INT NOT NULL,
  min_season INT NOT NULL,
  max_season INT NOT NULL,
  random_season BOOLEAN NOT NULL DEFAULT false, -- pick one random season in the range per draft
  allowed_tiers TEXT[] NOT NULL,
  budget INT NOT NULL,
  sort_order INT NOT NULL
);

INSERT INTO game_modes
  (slug, name, description, unlock_trophies, min_season, max_season, random_season, allowed_tiers, budget, sort_order)
VALUES
  ('rookie-camp', 'Rookie Camp', 'Draft from the 2007 season. Bronze and silver cards only.',
    0, 2007, 2007, false, ARRAY['bronze','silver'], 300, 1),
  ('draft-night', 'Draft Night', 'A different random season every draft. Cards up to gold.',
    200, 1999, 2026, true, ARRAY['bronze','silver','gold'], 400, 2),
  ('decade-drafts', 'Decade Drafts', 'Every player from the 2010s. Cards up to gold.',
    500, 2010, 2019, false, ARRAY['bronze','silver','gold'], 550, 3),
  ('legends', 'Legends', 'Gold and elite cards from every season.',
    900, 1999, 2026, false, ARRAY['gold','elite'], 700, 4),
  ('all-stars', 'All-Stars', 'Elite cards only, the best of the best.',
    1500, 1999, 2026, false, ARRAY['elite'], 850, 5);

-- Down Migration
DROP TABLE game_modes;
ALTER TABLE users ALTER COLUMN tokens SET DEFAULT 1000;
ALTER TABLE users DROP COLUMN best_trophies;
ALTER TABLE users DROP COLUMN trophies;