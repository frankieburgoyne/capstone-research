-- Up Migration
-- The betting screen. Offers are the bets on the board for one user (each can be bet on once).
-- A bet is a placed wager: one or more picks ("legs"), all of which must win to be paid.
CREATE TABLE bet_offers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('h2h', 'over_under')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bet_offers_user_idx ON bet_offers (user_id, id);

CREATE TABLE bets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stake INT NOT NULL CHECK (stake > 0),
  odds DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('won', 'lost', 'push')),
  payout INT NOT NULL,
  legs JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bets_user_idx ON bets (user_id, created_at DESC);

-- Down Migration
DROP TABLE bets;
DROP TABLE bet_offers;