-- Up Migration
-- Friends, messages, and friend-vs-friend challenges.

-- One row per pair of users. user_low is always the smaller id, so a pair can only exist once.
CREATE TABLE friendships (
  user_low INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX friendships_high_idx ON friendships (user_high);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX messages_pair_idx ON messages (sender_id, recipient_id, id);
CREATE INDEX messages_inbox_idx ON messages (recipient_id, read_at);

-- A challenge: both players draft from the SAME pool, then their lineups play.
-- drafting = the challenger is still building a lineup
-- invited = waiting for the friend to accept
-- accepted = the friend is drafting
CREATE TABLE challenges (
  id SERIAL PRIMARY KEY,
  challenger_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode_slug TEXT NOT NULL REFERENCES game_modes(slug),
  wager INT NOT NULL DEFAULT 0 CHECK (wager >= 0),
  status TEXT NOT NULL CHECK (status IN ('drafting', 'invited', 'accepted', 'complete', 'declined', 'cancelled')),
  accepted_at TIMESTAMPTZ,
  winner_id INT REFERENCES users(id),
  challenger_total DOUBLE PRECISION,
  opponent_total DOUBLE PRECISION,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (challenger_id <> opponent_id)
);
CREATE INDEX challenges_challenger_idx ON challenges (challenger_id, id DESC);
CREATE INDEX challenges_opponent_idx ON challenges (opponent_id, id DESC);

-- Each player's lineup in a challenge is a normal draft row that points at the challenge.
ALTER TABLE drafts ADD COLUMN challenge_id INT REFERENCES challenges(id) ON DELETE CASCADE;

-- The one-open-draft-per-mode rule only applies to normal drafts, not challenge drafts
DROP INDEX drafts_one_open;
CREATE UNIQUE INDEX drafts_one_open ON drafts (user_id, mode_slug) WHERE status = 'open' AND challenge_id IS NULL;

-- Down Migration
DROP INDEX drafts_one_open;
DELETE FROM drafts WHERE challenge_id IS NOT NULL;
CREATE UNIQUE INDEX drafts_one_open ON drafts (user_id, mode_slug) WHERE status = 'open';
ALTER TABLE drafts DROP COLUMN challenge_id;
DROP TABLE challenges;
DROP TABLE messages;
DROP TABLE friendships;