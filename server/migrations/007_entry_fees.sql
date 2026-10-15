-- Up Migration
-- Playing a matchup now costs an entry fee in tokens. A win pays back double the fee,
-- a draw pays back the fee, and a loss pays nothing. This replaces the fixed token rewards.
ALTER TABLE game_modes ADD COLUMN entry_fee INT NOT NULL DEFAULT 10;
UPDATE game_modes SET entry_fee = 10  WHERE slug = 'rookie-camp';
UPDATE game_modes SET entry_fee = 25  WHERE slug = 'draft-night';
UPDATE game_modes SET entry_fee = 50  WHERE slug = 'decade-drafts';
UPDATE game_modes SET entry_fee = 100 WHERE slug = 'legends';
UPDATE game_modes SET entry_fee = 250 WHERE slug = 'all-stars';
ALTER TABLE game_modes DROP COLUMN win_tokens;
ALTER TABLE game_modes DROP COLUMN loss_tokens;

-- Each draft remembers the fee it was bought with (drafts that already exist are free)
ALTER TABLE drafts ADD COLUMN entry_fee INT NOT NULL DEFAULT 0;

-- Down Migration
ALTER TABLE drafts DROP COLUMN entry_fee;
ALTER TABLE game_modes ADD COLUMN loss_tokens INT NOT NULL DEFAULT 10;
ALTER TABLE game_modes ADD COLUMN win_tokens INT NOT NULL DEFAULT 30;
ALTER TABLE game_modes DROP COLUMN entry_fee;