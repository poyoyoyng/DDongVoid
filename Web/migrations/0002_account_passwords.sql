CREATE TABLE account_passwords (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
