-- Weekly active competitors (WAC), straight from the database.
-- Same definition as lib/metrics.ts (which powers /admin/metrics and
-- GET /api/admin/metrics): distinct users with at least one confirmed ranked
-- match in the ISO week (Monday–Sunday, India time).
--   * clan matches: InternalSinglesMatches / InternalDoublesMatches hold only
--     confirmed results (pending ones live in MatchSubmissions)
--   * tournament matches: a winner has been recorded and confirmed
-- Run with: mysql ... < db/queries/wac.sql

WITH activity AS (
  SELECT match_date AS at, player_1 AS uid FROM InternalSinglesMatches
  UNION ALL SELECT match_date, player_2 FROM InternalSinglesMatches
  UNION ALL SELECT match_date, team1_player1 FROM InternalDoublesMatches
  UNION ALL SELECT match_date, team1_player2 FROM InternalDoublesMatches
  UNION ALL SELECT match_date, team2_player1 FROM InternalDoublesMatches
  UNION ALL SELECT match_date, team2_player2 FROM InternalDoublesMatches
  UNION ALL
  SELECT COALESCE(tm.recorded_at, tm.match_date), p.uid COLLATE utf8mb4_bin
  FROM TournamentMatches tm
  JOIN TournamentTeams t ON t.team_id = tm.team1_id OR t.team_id = tm.team2_id
  JOIN JSON_TABLE(
    CAST(COALESCE(IF(t.team_id = tm.team1_id, tm.team1_players, tm.team2_players), t.players) AS JSON),
    '$[*]' COLUMNS (uid VARCHAR(128) PATH '$')
  ) p
  WHERE tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
),
local AS (
  SELECT DATE(at + INTERVAL 330 MINUTE) AS day, uid FROM activity
  WHERE at >= UTC_TIMESTAMP() - INTERVAL 12 WEEK AND uid IS NOT NULL
)
SELECT day - INTERVAL WEEKDAY(day) DAY AS week_start,
       DATE_FORMAT(day, '%x-W%v') AS iso_week,
       COUNT(DISTINCT uid) AS wac
FROM local
GROUP BY week_start, iso_week
ORDER BY week_start;
