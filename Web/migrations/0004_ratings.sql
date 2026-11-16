CREATE TABLE ratings (
  game TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  rating REAL NOT NULL,
  PRIMARY KEY (game, account_id)
);
