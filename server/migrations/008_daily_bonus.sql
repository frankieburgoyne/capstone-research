-- Up Migration
-- A free daily token bonus, so nobody gets stuck with too few tokens to enter a mode.
ALTER TABLE users ADD COLUMN last_bonus_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE users DROP COLUMN last_bonus_at;