-- Up Migration
-- Each game mode now says how smart the computer is and what a win or loss is worth.
ALTER TABLE game_modes ADD COLUMN bot_noise NUMERIC NOT NULL DEFAULT 0.3; -- 0 = perfect computer, higher = sloppier (1 means a card's value can be off by 100%)
ALTER TABLE game_modes ADD COLUMN win_trophies INT NOT NULL DEFAULT 30;
ALTER TABLE game_modes ADD COLUMN loss_trophies INT NOT NULL DEFAULT 20;
ALTER TABLE game_modes ADD COLUMN win_tokens INT NOT NULL DEFAULT 30;
ALTER TABLE game_modes ADD COLUMN loss_tokens INT NOT NULL DEFAULT 10;

UPDATE game_modes SET bot_noise = 1.50, win_trophies = 30, loss_trophies = 15, win_tokens = 20,  loss_tokens = 5   WHERE slug = 'rookie-camp';
UPDATE game_modes SET bot_noise = 0.90, win_trophies = 30, loss_trophies = 20, win_tokens = 30,  loss_tokens = 10  WHERE slug = 'draft-night';
UPDATE game_modes SET bot_noise = 0.50, win_trophies = 30, loss_trophies = 20, win_tokens = 40,  loss_tokens = 15  WHERE slug = 'decade-drafts';
UPDATE game_modes SET bot_noise = 0.25, win_trophies = 30, loss_trophies = 25, win_tokens = 60,  loss_tokens = 25  WHERE slug = 'legends';
UPDATE game_modes SET bot_noise = 0.05, win_trophies = 30, loss_trophies = 30, win_tokens = 100, loss_tokens = 40  WHERE slug = 'all-stars';

-- The result of a lineup played against the computer (one per submitted draft).
-- details keeps a snapshot of both lineups and every card's game-day score.
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  draft_id INT NOT NULL UNIQUE REFERENCES drafts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_name TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  user_total DOUBLE PRECISION NOT NULL,
  cpu_total DOUBLE PRECISION NOT NULL,
  trophy_delta INT NOT NULL,
  token_delta INT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matches_user_idx ON matches (user_id, created_at DESC);

-- Down Migration
DROP TABLE matches;
ALTER TABLE game_modes DROP COLUMN loss_tokens;
ALTER TABLE game_modes DROP COLUMN win_tokens;
ALTER TABLE game_modes DROP COLUMN loss_trophies;
ALTER TABLE game_modes DROP COLUMN win_trophies;
ALTER TABLE game_modes DROP COLUMN bot_noise;