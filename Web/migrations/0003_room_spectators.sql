CREATE TABLE room_spectators (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  spectators TEXT NOT NULL,
  revision INTEGER NOT NULL
);
