// SPO-4 Phase 1: invite links, push notifications and the WAC metric.

export async function up(db, { columnExists }) {
  // A shareable link to a clan, academy batch or game session. The token is
  // the only thing in the URL (/i/<token>); internal ids never leave the
  // server. A batch link remembers the batch's invite code when it was made,
  // so regenerating the code also kills old links.
  await db.query(`
    CREATE TABLE IF NOT EXISTS InviteLinks (
      token        VARCHAR(64) NOT NULL PRIMARY KEY,
      target_type  ENUM('clan','batch','session') NOT NULL,
      target_id    INT NOT NULL,
      invite_code  VARCHAR(16) NULL,
      created_by   VARCHAR(128) NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at   DATETIME NULL,
      revoked_at   DATETIME NULL,
      revoked_by   VARCHAR(128) NULL,
      use_count    INT NOT NULL DEFAULT 0,
      KEY idx_invite_target (target_type, target_id)
    )
  `);

  // Who joined through which link (attribution + "your invite was accepted")
  await db.query(`
    CREATE TABLE IF NOT EXISTS InviteAcceptances (
      token       VARCHAR(64) NOT NULL,
      user_id     VARCHAR(128) NOT NULL,
      accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (token, user_id)
    )
  `);

  // FCM registration tokens; a user can have several devices. A token
  // belongs to at most one user (the last one to sign in on that device).
  await db.query(`
    CREATE TABLE IF NOT EXISTS DeviceTokens (
      token        VARCHAR(512) NOT NULL,
      user_id      VARCHAR(128) NOT NULL,
      platform     VARCHAR(16) NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_device_token (token),
      KEY idx_device_user (user_id)
    )
  `);

  // Per-category push opt-outs. No row means enabled.
  await db.query(`
    CREATE TABLE IF NOT EXISTS NotificationPreferences (
      user_id  VARCHAR(128) NOT NULL,
      category VARCHAR(32) NOT NULL,
      enabled  TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, category)
    )
  `);

  // Every push we decided to send (or skip), for the daily cap and debugging
  await db.query(`
    CREATE TABLE IF NOT EXISTS NotificationLog (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       VARCHAR(128) NOT NULL,
      type          VARCHAR(48) NOT NULL,
      transactional TINYINT(1) NOT NULL,
      outcome       VARCHAR(16) NOT NULL, -- sent | no_device | opted_out | capped | failed
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notif_user_time (user_id, created_at)
    )
  `);

  // When a tournament result was recorded. match_date is when the fixture was
  // generated, which can be weeks earlier; WAC buckets by this instead.
  if (!(await columnExists("TournamentMatches", "recorded_at"))) {
    await db.query(`ALTER TABLE TournamentMatches ADD COLUMN recorded_at DATETIME NULL`);
  }

  // Signup date for new-user counts and retention cohorts. Production's Users
  // table never had one: backfill existing users with their first clan join
  // (the best signal we have), then default new rows to now.
  if (!(await columnExists("Users", "created_at"))) {
    await db.query(`ALTER TABLE Users ADD COLUMN created_at DATETIME NULL`);
    await db.query(`
      UPDATE Users u SET created_at = (SELECT MIN(cm.join_date) FROM ClanMembers cm WHERE cm.user_id = u.user_id)
      WHERE u.created_at IS NULL
    `);
    await db.query(`ALTER TABLE Users MODIFY COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP`);
  }
}
