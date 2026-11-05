import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();
    const userId = uid;

    // ── Phase 1: all userId-only queries in parallel ──────────────────────────
    const [
      userRows,
      clanRows,
      singleStats,
      doublesStats,
      singlesStreak,
      doublesStreak,
      mostWinsRows,
      mostLossesRows,
      globalTeamRows,
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
         FROM InternalSinglesMatches
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
         FROM InternalSinglesMatches
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
         FROM InternalSinglesMatches im
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
         FROM InternalSinglesMatches im
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
    ]);

    const user = (userRows as { user_id: string; name: string; email: string; global_pts: number }[])[0];
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const clans = clanRows as { clan_id: string; name: string; clan_points: number }[];
    const clanId = clans[0]?.clan_id ?? null;
    const globalTeamIds = (globalTeamRows as { team_id: number }[]).map(r => r.team_id);

    // ── Streak computation (pure JS, no DB) ───────────────────────────────────
    const allMatchesDesc = [...(singlesStreak as { match_date: string; won: number }[]),
                            ...(doublesStreak as { match_date: string; won: number }[])]
      .filter(m => m.match_date)
      .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());

    let currentStreak = 0;
    for (const m of allMatchesDesc) { if (m.won) currentStreak++; else break; }
    let bestStreak = 0, tempStreak = 0;
    for (const m of [...allMatchesDesc].reverse()) {
      if (m.won) { tempStreak++; if (tempStreak > bestStreak) bestStreak = tempStreak; }
      else tempStreak = 0;
    }

    // ── Phase 2: clanId + globalTeamId dependent queries in parallel ──────────
    const gph = globalTeamIds.length ? globalTeamIds.map(() => "?").join(",") : "NULL";

    const [
      clanPointsRows,
      clanSinglesRows,
      clanDoublesRows,
      clanSeriesSinglesRows,
      clanSeriesDoublesRows,
      clanTeamRows,
      globalTourneySinglesRows,
      globalTourneyDoublesRows,
      globalTourneyPlayedRows,
      globalTourneyWonRows,
      globalTourneyRuRows,
    ] = await Promise.all([
      clanId
        ? executeQuery(
            `SELECT clan_points FROM ClanLeaderboard WHERE user_id = ? AND clan_id = ?`,
            [userId, clanId]
          )
        : Promise.resolve([]),
      clanId
        ? executeQuery(
            `SELECT COUNT(*) as matches_played,
               SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) as matches_won
             FROM InternalSinglesMatches
             WHERE clan_id = ? AND (player_1 = ? OR player_2 = ?)`,
            [userId, clanId, userId, userId]
          )
        : Promise.resolve([{ matches_played: 0, matches_won: 0 }]),
      clanId
        ? executeQuery(
            `SELECT COUNT(*) as matches_played,
               SUM(CASE WHEN
                   ((team1_player1 = ? OR team1_player2 = ?) AND winner_team = 'team1')
                   OR
                   ((team2_player1 = ? OR team2_player2 = ?) AND winner_team = 'team2')
                 THEN 1 ELSE 0 END) as matches_won
             FROM InternalDoublesMatches
             WHERE clan_id = ? AND (team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?)`,
            [userId, userId, userId, userId, clanId, userId, userId, userId, userId]
          )
        : Promise.resolve([{ matches_played: 0, matches_won: 0 }]),
      clanId
        ? executeQuery(
            `SELECT COUNT(*) as matches_played,
               SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) as matches_won
             FROM InternalSinglesMatches
             WHERE clan_id = ? AND (player_1 = ? OR player_2 = ?) AND series_id IS NOT NULL`,
            [userId, clanId, userId, userId]
          )
        : Promise.resolve([{ matches_played: 0, matches_won: 0 }]),
      clanId
        ? executeQuery(
            `SELECT COUNT(*) as matches_played,
               SUM(CASE WHEN
                   ((team1_player1 = ? OR team1_player2 = ?) AND winner_team = 'team1')
                   OR
                   ((team2_player1 = ? OR team2_player2 = ?) AND winner_team = 'team2')
                 THEN 1 ELSE 0 END) as matches_won
             FROM InternalDoublesMatches
             WHERE clan_id = ? AND (team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?)
               AND series_id IS NOT NULL`,
            [userId, userId, userId, userId, clanId, userId, userId, userId, userId]
          )
        : Promise.resolve([{ matches_played: 0, matches_won: 0 }]),
      clanId
        ? executeQuery(
            `SELECT tt.team_id FROM TournamentTeams tt
             JOIN Tournaments t ON tt.tournament_id = t.tournament_id
             WHERE JSON_CONTAINS(tt.players, JSON_QUOTE(?)) AND t.clan_id = ?`,
            [userId, clanId]
          )
        : Promise.resolve([]),
      globalTeamIds.length
        ? executeQuery(
            `SELECT COUNT(*) as total_played,
               SUM(CASE WHEN tm.winner_team_id IN (${gph}) THEN 1 ELSE 0 END) as total_won
             FROM TournamentMatches tm
             JOIN Tournaments t ON tm.tournament_id = t.tournament_id
             WHERE (tm.team1_id IN (${gph}) OR tm.team2_id IN (${gph}))
               AND tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
               AND t.tournament_type = 'singles'`,
            [...globalTeamIds, ...globalTeamIds, ...globalTeamIds]
          )
        : Promise.resolve([{ total_played: 0, total_won: 0 }]),
      globalTeamIds.length
        ? executeQuery(
            `SELECT COUNT(*) as total_played,
               SUM(CASE WHEN tm.winner_team_id IN (${gph}) THEN 1 ELSE 0 END) as total_won
             FROM TournamentMatches tm
             JOIN Tournaments t ON tm.tournament_id = t.tournament_id
             WHERE (tm.team1_id IN (${gph}) OR tm.team2_id IN (${gph}))
               AND tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
               AND t.tournament_type = 'doubles'`,
            [...globalTeamIds, ...globalTeamIds, ...globalTeamIds]
          )
        : Promise.resolve([{ total_played: 0, total_won: 0 }]),
      globalTeamIds.length
        ? executeQuery(
            `SELECT COUNT(DISTINCT tm.tournament_id) as cnt
             FROM TournamentTeams tm
             JOIN Tournaments t ON tm.tournament_id = t.tournament_id
             WHERE tm.team_id IN (${gph}) AND t.status = 'completed'`,
            globalTeamIds
          )
        : Promise.resolve([{ cnt: 0 }]),
      globalTeamIds.length
        ? executeQuery(
            `SELECT COUNT(*) as cnt FROM Tournaments t
             WHERE t.winner_team_id IN (${gph}) AND t.status = 'completed'`,
            globalTeamIds
          )
        : Promise.resolve([{ cnt: 0 }]),
      globalTeamIds.length
        ? executeQuery(
            `SELECT COUNT(*) as cnt
             FROM TournamentMatches tm
             JOIN Tournaments t ON tm.tournament_id = t.tournament_id
             WHERE tm.match_stage = 'Final'
               AND tm.winner_team_id IS NOT NULL
               AND t.status = 'completed'
               AND (
                 (tm.team1_id IN (${gph}) AND tm.winner_team_id != tm.team1_id)
                 OR
                 (tm.team2_id IN (${gph}) AND tm.winner_team_id != tm.team2_id)
               )`,
            [...globalTeamIds, ...globalTeamIds]
          )
        : Promise.resolve([{ cnt: 0 }]),
    ]);

    const clanTeamIds = (clanTeamRows as { team_id: number }[]).map(r => r.team_id);

    // ── Phase 3: clan tournament team dependent queries in parallel ────────────
    let clanTourneyStats = { singles_played: 0, singles_won: 0, doubles_played: 0, doubles_won: 0, tournaments_played: 0, tournaments_won: 0, runner_up: 0 };

    if (clanTeamIds.length > 0) {
      const cph = clanTeamIds.map(() => "?").join(",");
      const [
        cTournSinglesRows,
        cTournDoublesRows,
        cTournPlayedRows,
        cTournWonRows,
        cTournRuRows,
      ] = await Promise.all([
        executeQuery(
          `SELECT COUNT(*) as matches_played,
             SUM(CASE WHEN tm.winner_team_id IN (${cph}) THEN 1 ELSE 0 END) as matches_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${cph}) OR tm.team2_id IN (${cph}))
             AND tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
             AND t.tournament_type = 'singles'
             AND t.clan_id = ?`,
          [...clanTeamIds, ...clanTeamIds, ...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(*) as matches_played,
             SUM(CASE WHEN tm.winner_team_id IN (${cph}) THEN 1 ELSE 0 END) as matches_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${cph}) OR tm.team2_id IN (${cph}))
             AND tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
             AND t.tournament_type = 'doubles'
             AND t.clan_id = ?`,
          [...clanTeamIds, ...clanTeamIds, ...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(DISTINCT tm.tournament_id) as cnt
           FROM TournamentTeams tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE tm.team_id IN (${cph}) AND t.status = 'completed' AND t.clan_id = ?`,
          [...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(*) as cnt FROM Tournaments t
           WHERE t.winner_team_id IN (${cph}) AND t.status = 'completed' AND t.clan_id = ?`,
          [...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(*) as cnt
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE tm.match_stage = 'Final'
             AND tm.winner_team_id IS NOT NULL
             AND t.status = 'completed'
             AND t.clan_id = ?
             AND (
               (tm.team1_id IN (${cph}) AND tm.winner_team_id != tm.team1_id)
               OR
               (tm.team2_id IN (${cph}) AND tm.winner_team_id != tm.team2_id)
             )`,
          [clanId, ...clanTeamIds, ...clanTeamIds]
        ),
      ]);

      clanTourneyStats = {
        singles_played: Number((cTournSinglesRows as { matches_played: number; matches_won: number }[])[0]?.matches_played) || 0,
        singles_won:    Number((cTournSinglesRows as { matches_played: number; matches_won: number }[])[0]?.matches_won)    || 0,
        doubles_played: Number((cTournDoublesRows as { matches_played: number; matches_won: number }[])[0]?.matches_played) || 0,
        doubles_won:    Number((cTournDoublesRows as { matches_played: number; matches_won: number }[])[0]?.matches_won)    || 0,
        tournaments_played: Number((cTournPlayedRows as { cnt: number }[])[0]?.cnt) || 0,
        tournaments_won:    Number((cTournWonRows   as { cnt: number }[])[0]?.cnt)  || 0,
        runner_up:          Number((cTournRuRows    as { cnt: number }[])[0]?.cnt)  || 0,
      };
    }

    // ── Assemble response ─────────────────────────────────────────────────────
    const clanPointRow = (clanPointsRows as { clan_points: number }[])[0];
    const cS  = (clanSinglesRows       as { matches_played: number; matches_won: number }[])[0];
    const cD  = (clanDoublesRows       as { matches_played: number; matches_won: number }[])[0];
    const cSS = (clanSeriesSinglesRows as { matches_played: number; matches_won: number }[])[0];
    const cDS = (clanSeriesDoublesRows as { matches_played: number; matches_won: number }[])[0];
    const gS  = (singleStats           as { total_played: number; total_won: number }[])[0];
    const gD  = (doublesStats          as { total_played: number; total_won: number }[])[0];
    const gTS = (globalTourneySinglesRows as { total_played: number; total_won: number }[])[0];
    const gTD = (globalTourneyDoublesRows as { total_played: number; total_won: number }[])[0];

    return NextResponse.json({
      user_id:    user.user_id,
      name:       user.name,
      email:      user.email,
      global_pts: user.global_pts,
      clans,
      stats: {
        singles_played: (Number(gS?.total_played) || 0) + (Number(gTS?.total_played) || 0),
        singles_won:    (Number(gS?.total_won)    || 0) + (Number(gTS?.total_won)    || 0),
        doubles_played: (Number(gD?.total_played) || 0) + (Number(gTD?.total_played) || 0),
        doubles_won:    (Number(gD?.total_won)    || 0) + (Number(gTD?.total_won)    || 0),
      },
      currentStreak,
      bestStreak,
      mostWinsAgainst:   mostWinsRows,
      mostLossesAgainst: mostLossesRows,
      globalTournaments: {
        played:    Number((globalTourneyPlayedRows as { cnt: number }[])[0]?.cnt) || 0,
        won:       Number((globalTourneyWonRows   as { cnt: number }[])[0]?.cnt) || 0,
        runner_up: Number((globalTourneyRuRows    as { cnt: number }[])[0]?.cnt) || 0,
      },
      activeClanStats: clanId ? {
        clan_id:     clanId,
        clan_points: Number(clanPointRow?.clan_points) || 0,
        singles_played: (Number(cS?.matches_played) || 0) + clanTourneyStats.singles_played,
        singles_won:    (Number(cS?.matches_won)    || 0) + clanTourneyStats.singles_won,
        doubles_played: (Number(cD?.matches_played) || 0) + clanTourneyStats.doubles_played,
        doubles_won:    (Number(cD?.matches_won)    || 0) + clanTourneyStats.doubles_won,
        series_singles_played: Number(cSS?.matches_played) || 0,
        series_singles_won:    Number(cSS?.matches_won)    || 0,
        series_doubles_played: Number(cDS?.matches_played) || 0,
        series_doubles_won:    Number(cDS?.matches_won)    || 0,
        tournaments_played: clanTourneyStats.tournaments_played,
        tournaments_won:    clanTourneyStats.tournaments_won,
        runner_up:          clanTourneyStats.runner_up,
      } : null,
    });
  } catch (error) {
    console.error("❌ Dashboard all error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
