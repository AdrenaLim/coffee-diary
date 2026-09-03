-- migration v2 -> v3: add recorder column (kang | natasha)
ALTER TABLE brews ADD COLUMN recorder TEXT NOT NULL DEFAULT 'kang';
