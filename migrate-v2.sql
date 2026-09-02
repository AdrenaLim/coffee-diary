-- migration v1 -> v2: add milk_g column (no-op if already present)
ALTER TABLE brews ADD COLUMN milk_g REAL DEFAULT 0;
