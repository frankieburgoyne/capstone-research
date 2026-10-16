-- Up Migration
-- Profile customization: bio, favourite team, accent colour, banner style and a small profile picture.

ALTER TABLE users
  ADD COLUMN bio TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  ADD COLUMN favorite_team TEXT NOT NULL DEFAULT '' CHECK (char_length(favorite_team) <= 40),
  ADD COLUMN accent TEXT NOT NULL DEFAULT 'blue' CHECK (accent IN ('blue', 'cyan', 'green', 'gold', 'elite')),
  ADD COLUMN banner TEXT NOT NULL DEFAULT 'floodlight' CHECK (banner IN ('floodlight', 'field', 'stripes', 'night')),
  -- A small resized image stored as a data URL (about 10 KB in practice)
  ADD COLUMN avatar TEXT CHECK (avatar IS NULL OR char_length(avatar) <= 90000);

-- Down Migration
ALTER TABLE users
  DROP COLUMN avatar,
  DROP COLUMN banner,
  DROP COLUMN accent,
  DROP COLUMN favorite_team,
  DROP COLUMN bio;
