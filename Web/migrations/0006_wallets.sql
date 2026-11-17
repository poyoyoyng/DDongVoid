CREATE TABLE wallets (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  balance INTEGER NOT NULL,
  bankruptcies INTEGER NOT NULL DEFAULT 0
);
