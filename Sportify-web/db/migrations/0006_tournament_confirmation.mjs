// SPO-8: tournament results follow the clan rule, nobody confirms their own
// result. Additive only: no existing column or row is changed.

export async function up(db, { columnExists }) {
  // A tournament result recorded by someone who played in it waits in
  // MatchSubmissions (like a clan match) until the other side or a different
  // host / clan admin confirms it. TournamentMatches.winner_team_id stays NULL
  // until then, so the bracket, standings and ratings only see confirmed results.
  if (!(await columnExists("MatchSubmissions", "tournament_match_id"))) {
    await db.query(`ALTER TABLE MatchSubmissions ADD COLUMN tournament_match_id INT NULL, ADD KEY idx_ms_tournament_match (tournament_match_id, status)`);
  }

  // Who recorded a tournament result (the submitter, for confirmed submissions).
  if (!(await columnExists("TournamentMatches", "recorded_by"))) {
    await db.query(`ALTER TABLE TournamentMatches ADD COLUMN recorded_by VARCHAR(128) NULL`);
  }
}
