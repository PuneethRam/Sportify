// SPO-3: opponent result confirmation, and an owner for tournaments so the
// host (not just any logged-in user) can manage them.

export async function up(db, { columnExists }) {
  // A submitted clan match result. It only becomes a row in
  // InternalSinglesMatches / InternalDoublesMatches (and only touches
  // ClanLeaderboard) once a player on the other side, or a clan admin, confirms.
  await db.query(`
    CREATE TABLE IF NOT EXISTS MatchSubmissions (
      submission_id  INT AUTO_INCREMENT PRIMARY KEY,
      clan_id        INT NOT NULL,
      match_type     ENUM('singles','doubles') NOT NULL,
      series_id      INT NULL,
      team1_player1  VARCHAR(128) NOT NULL,
      team1_player2  VARCHAR(128) NULL,
      team2_player1  VARCHAR(128) NOT NULL,
      team2_player2  VARCHAR(128) NULL,
      score_details  TEXT NOT NULL,
      winner         ENUM('team1','team2') NULL,
      status         ENUM('pending','confirmed','disputed') NOT NULL DEFAULT 'pending',
      submitted_by   VARCHAR(128) NOT NULL,
      submitted_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_by    VARCHAR(128) NULL,
      resolved_at    DATETIME NULL,
      match_id       INT NULL,
      KEY idx_ms_clan_status (clan_id, status)
    )
  `);

  if (!(await columnExists("Tournaments", "created_by"))) {
    await db.query(`ALTER TABLE Tournaments ADD COLUMN created_by VARCHAR(128) NULL`);
  }
}
