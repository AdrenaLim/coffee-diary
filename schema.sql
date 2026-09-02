-- Coffee Diary schema v2
CREATE TABLE IF NOT EXISTS brews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,              -- 'latte' | 'icelatte' | 'coldbrew'
  bean TEXT NOT NULL,                -- bean name, e.g. ONA Strawberry Kiss
  grind REAL NOT NULL,              -- grinder setting (clicks on Barista Pro)
  dose_g REAL NOT NULL,             -- ground coffee in grams
  water_g REAL NOT NULL,            -- water used (brew water / espresso out)
  milk_g REAL DEFAULT 0,            -- milk added (ice latte)
  seconds INTEGER NOT NULL,         -- extraction / steep time (0 = untimed)
  rating INTEGER NOT NULL,          -- 1..10 stars
  notes TEXT DEFAULT '',            -- tasting notes
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brews_created ON brews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brews_method ON brews(method);
