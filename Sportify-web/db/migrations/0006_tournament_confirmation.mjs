// SPO-7: tournament results go through the same confirmation rule as clan
// matches (lib/tournamentResults.ts). Additive only: existing results keep
// counting exactly as before, because the new status column defaults to
// 'confirmed'. No existing row is rewritten.

export async function up(db, { columnExists }) {
  // Status of the recorded result. Only 'confirmed' results count towards
  // ratings, points, streaks, seasons and WAC; the bracket advances on any
  // result. Meaningless while winner_team_id is NULL.
  if (!(await columnExists("TournamentMatches", "result_status"))) {
    await db.query(
      `ALTER TABLE TournamentMatches
       ADD COLUMN result_status ENUM('pending','confirmed','disputed') NOT NULL DEFAULT 'confirmed'`
    );
  }
  // Who entered the result (NULL for results entered before SPO-7)
  if (!(await columnExists("TournamentMatches", "recorded_by"))) {
    await db.query(`ALTER TABLE TournamentMatches ADD COLUMN recorded_by VARCHAR(128) NULL`);
  }
  // Who confirmed or disputed it, and when
  if (!(await columnExists("TournamentMatches", "resolved_by"))) {
    await db.query(`ALTER TABLE TournamentMatches ADD COLUMN resolved_by VARCHAR(128) NULL`);
  }
  if (!(await columnExists("TournamentMatches", "resolved_at"))) {
    await db.query(`ALTER TABLE TournamentMatches ADD COLUMN resolved_at DATETIME NULL`);
  }
}
