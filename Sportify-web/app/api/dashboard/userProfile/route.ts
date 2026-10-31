import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || uid;

    // ── Phase 1: all userId-only queries in parallel ──────────────────────────
    const [
      userRows,
      clanRows,
      singleMatchStats,
      doublesMatchStats,
      singlesForStreak,
      doublesForStreak,
      mostWinsAgainst,
      mostLossesAgainst,
      userTeamRows,
      recentSingles,
      recentDoubles,
    ] = await Promise.all([
      executeQuery(
        `SELECT user_id, name, email, global_pts FROM Users WHERE user_id = ?`,
        [userId]
      ),
      executeQuery(
        `SELECT c.clan_id, c.name, cl.clan_points
         FROM ClanLeaderboard cl
         JOIN Clans c ON cl.clan_id = c.clan_id
         WHERE cl.user_id = ?`,
        [userId]
      ),
      executeQuery(
        `SELECT COUNT(*) as total_played,
           SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) as total_won
         FROM InternalsinglesMatches
         WHERE player_1 = ? OR player_2 = ?`,
        [userId, userId, userId]
      ),
      executeQuery(
        `SELECT COUNT(*) as total_played,
           SUM(CASE WHEN
               ((team1_player1 = ? OR team1_player2 = ?) AND winner_team = 'team1')
               OR
               ((team2_player1 = ? OR team2_player2 = ?) AND winner_team = 'team2')
             THEN 1 ELSE 0 END) as total_won
         FROM InternalDoublesMatches
         WHERE team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?`,
        [userId, userId, userId, userId, userId, userId, userId, userId]
      ),
      executeQuery(
        `SELECT match_date,
           CASE WHEN winner_player = ? THEN 1 ELSE 0 END as won
         FROM InternalsinglesMatches
         WHERE (player_1 = ? OR player_2 = ?) AND winner_player IS NOT NULL
         ORDER BY match_date DESC LIMIT 300`,
        [userId, userId, userId]
      ),
      executeQuery(
        `SELECT match_date,
           CASE WHEN
             ((team1_player1 = ? OR team1_player2 = ?) AND winner_team = 'team1')
             OR
             ((team2_player1 = ? OR team2_player2 = ?) AND winner_team = 'team2')
           THEN 1 ELSE 0 END as won
         FROM InternalDoublesMatches
         WHERE team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?
         ORDER BY match_date DESC LIMIT 300`,
        [userId, userId, userId, userId, userId, userId, userId, userId]
      ),
      executeQuery(
        `SELECT
           CASE WHEN player_1 = ? THEN player_2 ELSE player_1 END as opponent_id,
           u.name, COUNT(*) as wins
         FROM InternalsinglesMatches im
         JOIN Users u ON CASE WHEN im.player_1 = ? THEN im.player_2 ELSE im.player_1 END = u.user_id
         WHERE (player_1 = ? OR player_2 = ?) AND winner_player = ?
         GROUP BY opponent_id, u.name
         ORDER BY wins DESC LIMIT 3`,
        [userId, userId, userId, userId, userId]
      ),
      executeQuery(
        `SELECT
           CASE WHEN player_1 = ? THEN player_2 ELSE player_1 END as opponent_id,
           u.name, COUNT(*) as losses
         FROM InternalsinglesMatches im
         JOIN Users u ON CASE WHEN im.player_1 = ? THEN im.player_2 ELSE im.player_1 END = u.user_id
         WHERE (player_1 = ? OR player_2 = ?) AND winner_player != ? AND winner_player IS NOT NULL
         GROUP BY opponent_id, u.name
         ORDER BY losses DESC LIMIT 3`,
        [userId, userId, userId, userId, userId]
      ),
      executeQuery(
        `SELECT team_id FROM TournamentTeams WHERE JSON_CONTAINS(players, JSON_QUOTE(?))`,
        [userId]
      ),
      // Recent singles matches with opponent name and score
      executeQuery(
        `SELECT sm.match_id, 'singles' AS match_type, sm.match_date,
           u.name AS opponent_name,
           sm.score_details,
           CASE WHEN sm.winner_player = ? THEN 'win'
                WHEN sm.winner_player IS NULL THEN 'draw'
                ELSE 'loss' END AS result
         FROM InternalsinglesMatches sm
         JOIN Users u ON u.user_id = CASE WHEN sm.player_1 = ? THEN sm.player_2 ELSE sm.player_1 END
         WHERE sm.player_1 = ? OR sm.player_2 = ?
         ORDER BY sm.match_date DESC LIMIT 15`,
        [userId, userId, userId, userId]
      ),
      // Recent doubles matches — return partner id, join once
      executeQuery(
        `SELECT dm.match_id, 'doubles' AS match_type, dm.match_date,
           u.name AS partner_name,
           dm.score_details,
           CASE
             WHEN (dm.team1_player1 = ? OR dm.team1_player2 = ?) AND dm.winner_team = 'team1' THEN 'win'
             WHEN (dm.team2_player1 = ? OR dm.team2_player2 = ?) AND dm.winner_team = 'team2' THEN 'win'
             WHEN dm.winner_team IS NULL THEN 'draw'
             ELSE 'loss' END AS result
         FROM InternalDoublesMatches dm
         JOIN Users u ON u.user_id = CASE
           WHEN dm.team1_player1 = ? THEN dm.team1_player2
           WHEN dm.team1_player2 = ? THEN dm.team1_player1
           WHEN dm.team2_player1 = ? THEN dm.team2_player2
           ELSE dm.team2_player1 END
         WHERE dm.team1_player1 = ? OR dm.team1_player2 = ? OR dm.team2_player1 = ? OR dm.team2_player2 = ?
         ORDER BY dm.match_date DESC LIMIT 10`,
        [userId, userId, userId, userId,
         userId, userId, userId,
         userId, userId, userId, userId]
      ),
    ]);

    const userData = (userRows as { user_id: string; name: string; email: string; global_pts: number }[])[0];
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Streak computation ────────────────────────────────────────────────────
    const allMatchesDesc = [...(singlesForStreak as { match_date: string; won: number }[]),
                            ...(doublesForStreak as { match_date: string; won: number }[])]
      .filter(m => m.match_date)
      .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());

    let currentStreak = 0;
    for (const m of allMatchesDesc) { if (m.won) currentStreak++; else break; }
    let bestStreak = 0, tempStreak = 0;
    for (const m of [...allMatchesDesc].reverse()) {
      if (m.won) { tempStreak++; if (tempStreak > bestStreak) bestStreak = tempStreak; }
      else tempStreak = 0;
    }

    // ── Phase 2: tournament match stats (needs teamIds) ───────────────────────
    const userTeamIds = (userTeamRows as { team_id: number }[]).map(r => r.team_id);
    let tournamentSinglesPlayed = 0, tournamentSinglesWon = 0;
    let tournamentDoublesPlayed = 0, tournamentDoublesWon = 0;

    if (userTeamIds.length > 0) {
      const ph = userTeamIds.map(() => "?").join(",");
      const [tSingles, tDoubles] = await Promise.all([
        executeQuery(
          `SELECT COUNT(*) as total_played,
             SUM(CASE WHEN tm.winner_team_id IN (${ph}) THEN 1 ELSE 0 END) as total_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${ph}) OR tm.team2_id IN (${ph}))
             AND tm.winner_team_id IS NOT NULL
             AND t.tournament_type = 'singles'`,
          [...userTeamIds, ...userTeamIds, ...userTeamIds]
        ),
        executeQuery(
          `SELECT COUNT(*) as total_played,
             SUM(CASE WHEN tm.winner_team_id IN (${ph}) THEN 1 ELSE 0 END) as total_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${ph}) OR tm.team2_id IN (${ph}))
             AND tm.winner_team_id IS NOT NULL
             AND t.tournament_type = 'doubles'`,
          [...userTeamIds, ...userTeamIds, ...userTeamIds]
        ),
      ]);
      tournamentSinglesPlayed = Number((tSingles as { total_played: number; total_won: number }[])[0]?.total_played) || 0;
      tournamentSinglesWon   = Number((tSingles as { total_played: number; total_won: number }[])[0]?.total_won)    || 0;
      tournamentDoublesPlayed = Number((tDoubles as { total_played: number; total_won: number }[])[0]?.total_played) || 0;
      tournamentDoublesWon   = Number((tDoubles as { total_played: number; total_won: number }[])[0]?.total_won)    || 0;
    }

    const sm = (singleMatchStats as { total_played: number; total_won: number }[])[0];
    const dm = (doublesMatchStats as { total_played: number; total_won: number }[])[0];

    // Merge and sort recent matches (singles + doubles), newest first
    const recentMatches = [
      ...(recentSingles as object[]),
      ...(recentDoubles as object[]),
    ].sort((a: object, b: object) => {
      const aDate = new Date((a as { match_date: string }).match_date).getTime();
      const bDate = new Date((b as { match_date: string }).match_date).getTime();
      return bDate - aDate;
    }).slice(0, 20);

    return NextResponse.json({
      ...userData,
      clans: clanRows,
      stats: {
        singles_played: (Number(sm?.total_played) || 0) + tournamentSinglesPlayed,
        singles_won:    (Number(sm?.total_won)    || 0) + tournamentSinglesWon,
        doubles_played: (Number(dm?.total_played) || 0) + tournamentDoublesPlayed,
        doubles_won:    (Number(dm?.total_won)    || 0) + tournamentDoublesWon,
      },
      currentStreak,
      bestStreak,
      mostWinsAgainst,
      mostLossesAgainst,
      recentMatches,
    });
  } catch (error) {
    console.error("❌ userProfile error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
