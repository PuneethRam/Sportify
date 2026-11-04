// SPO-5 Phase 2: coach match entry, Glicko-2 ratings, seasons and badges,
// share cards. Additive only: no existing column or row is changed.
//
// Ratings start empty. Fill them from match history with
// `npm run ratings:backfill` (lib/ratings.ts recomputeRatings), which is
// idempotent and can be re-run at any time.

export async function up(db, { columnExists }) {
  // Current Glicko-2 rating per user per format
  await db.query(`
    CREATE TABLE IF NOT EXISTS PlayerRatings (
      user_id    VARCHAR(128) NOT NULL,
      format     ENUM('singles','doubles') NOT NULL,
      rating     DOUBLE NOT NULL,
      rd         DOUBLE NOT NULL,
      volatility DOUBLE NOT NULL,
      matches    INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, format)
    )
  `);

  // One row per player per rated match. Rebuilt from scratch on replay.
  await db.query(`
    CREATE TABLE IF NOT EXISTS RatingHistory (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      source           ENUM('clan_singles','clan_doubles','tournament') NOT NULL,
      match_id         INT NOT NULL,
      clan_id          INT NULL,
      format           ENUM('singles','doubles') NOT NULL,
      user_id          VARCHAR(128) NOT NULL,
      played_at        DATETIME NOT NULL,
      rating_before    DOUBLE NOT NULL,
      rating_after     DOUBLE NOT NULL,
      rd_before        DOUBLE NOT NULL,
      rd_after         DOUBLE NOT NULL,
      volatility_after DOUBLE NOT NULL,
      UNIQUE KEY uq_rating_match_user (source, match_id, user_id),
      KEY idx_rating_user (user_id, played_at),
      KEY idx_rating_clan (clan_id, played_at)
    )
  `);

  // A season (clan, month) that has been closed: badges awarded, pushes sent
  await db.query(`
    CREATE TABLE IF NOT EXISTS SeasonClosures (
      clan_id   INT NOT NULL,
      season    CHAR(7) NOT NULL, -- YYYY-MM, India time
      players   INT NOT NULL DEFAULT 0,
      closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (clan_id, season)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS SeasonBadges (
      clan_id    INT NOT NULL,
      season     CHAR(7) NOT NULL,
      user_id    VARCHAR(128) NOT NULL,
      badge      ENUM('champion','top3','most_matches','biggest_gain') NOT NULL,
      rank_pos   INT NULL,
      value      DOUBLE NULL,
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (clan_id, season, user_id, badge),
      KEY idx_badge_user (user_id)
    )
  `);

  // "At most once per ..." pushes (rank_overtaken per day, streak_at_risk per week)
  await db.query(`
    CREATE TABLE IF NOT EXISTS NotificationDedupe (
      dedupe_key VARCHAR(191) NOT NULL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Public share links for rank cards: /s/<token>. Only the token is in the
  // URL; the card shows public display names only.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ShareCards (
      token        VARCHAR(64) NOT NULL PRIMARY KEY,
      kind         ENUM('match','profile') NOT NULL,
      match_source ENUM('clan_singles','clan_doubles','tournament') NULL,
      match_id     INT NULL,
      user_id      VARCHAR(128) NULL,
      clan_id      INT NULL,
      created_by   VARCHAR(128) NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // How a result was entered: player (needs confirming), admin (one result)
  // or bulk (a coach recording a class). The recorder is submitted_by.
  if (!(await columnExists("MatchSubmissions", "entry_method"))) {
    await db.query(`ALTER TABLE MatchSubmissions ADD COLUMN entry_method VARCHAR(16) NOT NULL DEFAULT 'player'`);
  }
}
