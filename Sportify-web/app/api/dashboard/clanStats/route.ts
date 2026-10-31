import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();
    const userId = uid;

    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("clanId");

    if (!clanId) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }

    // ── Phase 1: clan-scoped stats + clan tournament teams in parallel ─────────
    const [
      clanPointsRows,
      singlesRows,
      doublesRows,
      seriesSinglesRows,
      seriesDoublesRows,
      clanTeamRows,
    ] = await Promise.all([
      executeQuery(
        `SELECT clan_points FROM ClanLeaderboard WHERE user_id = ? AND clan_id = ?`,
        [userId, clanId]
      ),
      executeQuery(
        `SELECT COUNT(*) as matches_played,
           SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) as matches_won
         FROM InternalSinglesMatches
         WHERE clan_id = ? AND (player_1 = ? OR player_2 = ?)`,
        [userId, clanId, userId, userId]
      ),
      executeQuery(
        `SELECT COUNT(*) as matches_played,
           SUM(CASE WHEN
               ((team1_player1 = ? OR team1_player2 = ?) AND winner_team = 'team1')
               OR
               ((team2_player1 = ? OR team2_player2 = ?) AND winner_team = 'team2')
             THEN 1 ELSE 0 END) as matches_won
         FROM InternalDoublesMatches
         WHERE clan_id = ? AND (team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ?)`,
        [userId, userId, userId, userId, clanId, userId, userId, userId, userId]
      ),
      executeQuery(
        `SELECT COUNT(*) as matches_played,
           SUM(CASE WHEN winner_player = ? THEN 1 ELSE 0 END) as matches_won
         FROM InternalSinglesMatches
         WHERE clan_id = ? AND (player_1 = ? OR player_2 = ?) AND series_id IS NOT NULL`,
        [userId, clanId, userId, userId]
      ),
      executeQuery(
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
      ),
      executeQuery(
        `SELECT tt.team_id FROM TournamentTeams tt
         JOIN Tournaments t ON tt.tournament_id = t.tournament_id
         WHERE JSON_CONTAINS(tt.players, JSON_QUOTE(?)) AND t.clan_id = ?`,
        [userId, clanId]
      ),
    ]);

    const clanPointsArr = clanPointsRows as { clan_points: number }[];
    if (clanPointsArr.length === 0) {
      return NextResponse.json({ error: "User is not part of this clan" }, { status: 404 });
    }

    const clanTeamIds = (clanTeamRows as { team_id: number }[]).map(r => r.team_id);

    // ── Phase 2: clan tournament match stats in parallel ──────────────────────
    let tournSinglesPlayed = 0, tournSinglesWon = 0;
    let tournDoublesPlayed = 0, tournDoublesWon = 0;
    let clan_tournaments_played = 0, clan_tournaments_won = 0, clan_runner_up = 0;

    if (clanTeamIds.length > 0) {
      const ph = clanTeamIds.map(() => "?").join(",");
      const [
        tSinglesRows,
        tDoublesRows,
        tPlayedRows,
        tWonRows,
        tRuRows,
      ] = await Promise.all([
        executeQuery(
          `SELECT COUNT(*) as matches_played,
             SUM(CASE WHEN tm.winner_team_id IN (${ph}) THEN 1 ELSE 0 END) as matches_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${ph}) OR tm.team2_id IN (${ph}))
             AND tm.winner_team_id IS NOT NULL
             AND t.tournament_type = 'singles'
             AND t.clan_id = ?`,
          [...clanTeamIds, ...clanTeamIds, ...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(*) as matches_played,
             SUM(CASE WHEN tm.winner_team_id IN (${ph}) THEN 1 ELSE 0 END) as matches_won
           FROM TournamentMatches tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE (tm.team1_id IN (${ph}) OR tm.team2_id IN (${ph}))
             AND tm.winner_team_id IS NOT NULL
             AND t.tournament_type = 'doubles'
             AND t.clan_id = ?`,
          [...clanTeamIds, ...clanTeamIds, ...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(DISTINCT tm.tournament_id) as cnt
           FROM TournamentTeams tm
           JOIN Tournaments t ON tm.tournament_id = t.tournament_id
           WHERE tm.team_id IN (${ph}) AND t.status = 'completed' AND t.clan_id = ?`,
          [...clanTeamIds, clanId]
        ),
        executeQuery(
          `SELECT COUNT(*) as cnt FROM Tournaments t
           WHERE t.winner_team_id IN (${ph}) AND t.status = 'completed' AND t.clan_id = ?`,
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
               (tm.team1_id IN (${ph}) AND tm.winner_team_id != tm.team1_id)
               OR
               (tm.team2_id IN (${ph}) AND tm.winner_team_id != tm.team2_id)
             )`,
          [clanId, ...clanTeamIds, ...clanTeamIds]
        ),
      ]);

      const tS = (tSinglesRows as { matches_played: number; matches_won: number }[])[0];
      const tD = (tDoublesRows as { matches_played: number; matches_won: number }[])[0];
      tournSinglesPlayed = Number(tS?.matches_played) || 0;
      tournSinglesWon   = Number(tS?.matches_won)    || 0;
      tournDoublesPlayed = Number(tD?.matches_played) || 0;
      tournDoublesWon   = Number(tD?.matches_won)    || 0;
      clan_tournaments_played = Number((tPlayedRows as { cnt: number }[])[0]?.cnt) || 0;
      clan_tournaments_won    = Number((tWonRows    as { cnt: number }[])[0]?.cnt) || 0;
      clan_runner_up          = Number((tRuRows     as { cnt: number }[])[0]?.cnt) || 0;
    }

    const cS  = (singlesRows       as { matches_played: number; matches_won: number }[])[0];
    const cD  = (doublesRows       as { matches_played: number; matches_won: number }[])[0];
    const cSS = (seriesSinglesRows as { matches_played: number; matches_won: number }[])[0];
    const cDS = (seriesDoublesRows as { matches_played: number; matches_won: number }[])[0];

    return NextResponse.json({
      clan_id:     clanId,
      clan_points: clanPointsArr[0].clan_points,
      singles_played: (Number(cS?.matches_played) || 0) + tournSinglesPlayed,
      singles_won:    (Number(cS?.matches_won)    || 0) + tournSinglesWon,
      doubles_played: (Number(cD?.matches_played) || 0) + tournDoublesPlayed,
      doubles_won:    (Number(cD?.matches_won)    || 0) + tournDoublesWon,
      series_singles_played: Number(cSS?.matches_played) || 0,
      series_singles_won:    Number(cSS?.matches_won)    || 0,
      series_doubles_played: Number(cDS?.matches_played) || 0,
      series_doubles_won:    Number(cDS?.matches_won)    || 0,
      tournaments_played: clan_tournaments_played,
      tournaments_won:    clan_tournaments_won,
      runner_up:          clan_runner_up,
    });
  } catch (error) {
    console.error("❌ clanStats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
