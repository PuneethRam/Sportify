-- Run this migration once to add per-format point columns
ALTER TABLE ClanLeaderboard
  ADD COLUMN IF NOT EXISTS singles_points FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doubles_points FLOAT NOT NULL DEFAULT 0;
