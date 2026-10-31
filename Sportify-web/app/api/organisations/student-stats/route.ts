import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/organisations/student-stats?userId=&batchId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const userId  = searchParams.get("userId") ?? uid;
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json({ error: "batchId is required" }, { status: 400 });
    }

    // ── Basic user info ──────────────────────────────────────────────────────
    const [user] = await executeQuery(
      `SELECT name, email FROM Users WHERE user_id = ?`,
      [userId]
    ) as { name: string; email: string }[];

    // ── Find org for this batch ──────────────────────────────────────────────
    const [batchInfo] = await executeQuery(
      `SELECT org_id FROM Clans WHERE clan_id = ?`,
      [batchId]
    ) as { org_id: number | null }[];

    const orgId = batchInfo?.org_id ?? null;

    // Collect all batch clan_ids in this org (or just the given batchId as fallback)
    let orgClanIds: number[] = [Number(batchId)];
    if (orgId) {
      const rows = await executeQuery(
        `SELECT clan_id FROM Clans WHERE type = 'batch' AND org_id = ?`,
        [orgId]
      ) as { clan_id: number }[];
      if (rows.length > 0) orgClanIds = rows.map(r => r.clan_id);
    }

    const phOrg = orgClanIds.map(() => "?").join(",");

    // ── Regular singles match stats (InternalsinglesMatches — note lowercase s) ─
    const [singlesRow] = await executeQuery(
      `SELECT
         COUNT(*) AS played,
         SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) AS won,
         SUM(CASE WHEN winner_player IS NOT NULL AND winner_player != ?
                  THEN 1 ELSE 0 END) AS lost
       FROM InternalsinglesMatches
       WHERE (player_1 = ? OR player_2 = ?)
         AND clan_id IN (${phOrg})`,
      [userId, userId, userId, userId, ...orgClanIds]
    ) as { played: number; won: number; lost: number }[];

    // ── Regular doubles match stats ───────────────────────────────────────────
    const [doublesRow] = await executeQuery(
      `SELECT
         COUNT(*) AS played,
         SUM(CASE WHEN
               (winner_team = 'team1' AND (team1_player1 = ? OR team1_player2 = ?))
               OR
               (winner_team = 'team2' AND (team2_player1 = ? OR team2_player2 = ?))
             THEN 1 ELSE 0 END) AS won,
         SUM(CASE WHEN winner_team IS NOT NULL AND (
               (winner_team = 'team2' AND (team1_player1 = ? OR team1_player2 = ?))
               OR
               (winner_team = 'team1' AND (team2_player1 = ? OR team2_player2 = ?))
             ) THEN 1 ELSE 0 END) AS lost
       FROM InternalDoublesMatches
       WHERE (team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?)
         AND clan_id IN (${phOrg})`,
      [
        userId, userId, userId, userId,
        userId, userId, userId, userId,
        userId, userId, userId, userId,
        ...orgClanIds,
      ]
    ) as { played: number; won: number; lost: number }[];

    // ── Tournament match stats (scoped to org's clans) ────────────────────────
    const teamRows = await executeQuery(
      `SELECT tt.team_id FROM TournamentTeams tt
       JOIN Tournaments t ON tt.tournament_id = t.tournament_id
       WHERE JSON_CONTAINS(tt.players, JSON_QUOTE(?))
         AND t.clan_id IN (${phOrg})`,
      [userId, ...orgClanIds]
    ) as { team_id: number }[];

    const teamIds = teamRows.map(r => r.team_id);
    let tourneyMatchesPlayed = 0, tourneyMatchesWon = 0;
    let tournamentsPlayed = 0, tournamentsWon = 0, runnerUp = 0;

    if (teamIds.length > 0) {
      const phTeam = teamIds.map(() => "?").join(",");

      // Tournament individual match count
      const [tmRow] = await executeQuery(
        `SELECT
           COUNT(*) AS played,
           SUM(CASE WHEN winner_team_id IN (${phTeam}) THEN 1 ELSE 0 END) AS won
         FROM TournamentMatches
         WHERE (team1_id IN (${phTeam}) OR team2_id IN (${phTeam}))
           AND winner_team_id IS NOT NULL`,
        [...teamIds, ...teamIds, ...teamIds]
      ) as { played: number; won: number }[];
      tourneyMatchesPlayed = Number(tmRow?.played) || 0;
      tourneyMatchesWon    = Number(tmRow?.won)    || 0;

      // Tournaments (whole event) won/runner-up
      const [playedRow] = await executeQuery(
        `SELECT COUNT(DISTINCT tm.tournament_id) AS cnt
         FROM TournamentTeams tm
         JOIN Tournaments t ON tm.tournament_id = t.tournament_id
         WHERE tm.team_id IN (${phTeam}) AND t.status = 'completed'`,
        teamIds
      ) as { cnt: number }[];
      tournamentsPlayed = Number(playedRow?.cnt) || 0;

      const [wonRow] = await executeQuery(
        `SELECT COUNT(*) AS cnt FROM Tournaments t
         WHERE t.winner_team_id IN (${phTeam}) AND t.status = 'completed'`,
        teamIds
      ) as { cnt: number }[];
      tournamentsWon = Number(wonRow?.cnt) || 0;

      const [ruRow] = await executeQuery(
        `SELECT COUNT(*) AS cnt
         FROM TournamentMatches tm
         JOIN Tournaments t ON tm.tournament_id = t.tournament_id
         WHERE tm.match_stage = 'Final'
           AND tm.winner_team_id IS NOT NULL
           AND t.status = 'completed'
           AND (
             (tm.team1_id IN (${phTeam}) AND tm.winner_team_id != tm.team1_id)
             OR
             (tm.team2_id IN (${phTeam}) AND tm.winner_team_id != tm.team2_id)
           )`,
        [...teamIds, ...teamIds]
      ) as { cnt: number }[];
      runnerUp = Number(ruRow?.cnt) || 0;
    }

    // Total match stats = regular + tournament matches
    const matchesplayed = Number(singlesRow?.played || 0) + Number(doublesRow?.played || 0) + tourneyMatchesPlayed;
    const matcheswon    = Number(singlesRow?.won    || 0) + Number(doublesRow?.won    || 0) + tourneyMatchesWon;
    const matcheslost   = Number(singlesRow?.lost   || 0) + Number(doublesRow?.lost   || 0)
                          + (tourneyMatchesPlayed - tourneyMatchesWon);

    // ── Points from ClanLeaderboard (org-scoped) ─────────────────────────────
    const [pointsRow] = await executeQuery(
      `SELECT COALESCE(SUM(clan_points), 0) AS total_points
       FROM ClanLeaderboard
       WHERE user_id = ? AND clan_id IN (${phOrg})`,
      [userId, ...orgClanIds]
    ) as { total_points: number }[];
    const clan_points = Number(pointsRow?.total_points || 0);

    // ── Attendance: batch-specific ────────────────────────────────────────────
    const [sessionRow] = await executeQuery(
      `SELECT COUNT(DISTINCT session_date) AS total_sessions FROM Attendance WHERE batch_id = ?`,
      [batchId]
    ) as { total_sessions: number }[];

    const [attRow] = await executeQuery(
      `SELECT
         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN status = 'late'    THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN status = 'absent'  THEN 1 ELSE 0 END) AS absent_count
       FROM Attendance
       WHERE batch_id = ? AND user_id = ?`,
      [batchId, userId]
    ) as { present_count: number; late_count: number; absent_count: number }[];

    const recentAttendance = await executeQuery(
      `SELECT session_date, status
       FROM Attendance
       WHERE batch_id = ? AND user_id = ?
       ORDER BY session_date DESC LIMIT 10`,
      [batchId, userId]
    );

    return NextResponse.json({
      success: true,
      stats: {
        name:  user?.name  ?? "",
        email: user?.email ?? "",
        clan_points,
        matchesplayed,
        matcheswon,
        matcheslost,
      },
      tournaments: {
        played:    tournamentsPlayed,
        won:       tournamentsWon,
        runner_up: runnerUp,
      },
      attendance: {
        totalSessions: Number(sessionRow?.total_sessions ?? 0),
        present: Number(attRow?.present_count ?? 0),
        late:    Number(attRow?.late_count    ?? 0),
        absent:  Number(attRow?.absent_count  ?? 0),
      },
      recentAttendance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
