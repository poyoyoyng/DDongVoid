CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  access_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  players TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX rooms_by_game ON rooms(game, status, created_at);

CREATE TABLE match_results (
  room_id TEXT NOT NULL,
  match_no INTEGER NOT NULL,
  game TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('W', 'D', 'L')),
  PRIMARY KEY (room_id, match_no, account_id)
);
CREATE INDEX match_results_by_game ON match_results(game, account_id);

CREATE TABLE solo_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  game TEXT NOT NULL,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_score INTEGER
);
CREATE INDEX solo_runs_by_player ON solo_runs(account_id, game, started_at);

CREATE TABLE solo_bests (
  game TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  score INTEGER NOT NULL,
  PRIMARY KEY (game, account_id)
);
CREATE INDEX solo_bests_by_game ON solo_bests(game, score DESC);
