CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INT,
  away_score INT,
  status TEXT,
  start_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS picks (
  id SERIAL PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  username TEXT NOT NULL,
  pick TEXT NOT NULL CHECK (pick IN ('home', 'away')),
  created_at TIMESTAMPTZ DEFAULT now()
);