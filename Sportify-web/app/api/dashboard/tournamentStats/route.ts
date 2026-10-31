import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  const userId = uid;

  const { searchParams } = new URL(req.url);
  const clanId = searchParams.get("clanId");

  try {
    const teamQuery = clanId
      ? `SELECT tt.team_id FROM TournamentTeams tt
         JOIN Tournaments t ON tt.tournament_id = t.tournament_id
         WHERE JSON_CONTAINS(tt.players, JSON_QUOTE(?)) AND t.clan_id = ?`
      : `SELECT team_id FROM TournamentTeams WHERE JSON_CONTAINS(players, JSON_QUOTE(?))`;
    const teamParams = clanId ? [userId, clanId] : [userId];

    const teamRows = await executeQuery(teamQuery, teamParams) as { team_id: number }[];
    const teamIds = teamRows.map(r => r.team_id);

    if (teamIds.length === 0) {
      return NextResponse.json({ played: 0, won: 0, runner_up: 0 });
    }

    const ph = teamIds.map(() => "?").join(",");
    const clanFilter = clanId ? ` AND t.clan_id = ?` : "";
    const clanParam  = clanId ? [clanId] : [];

    const [playedRows, wonRows, ruRows] = await Promise.all([
      executeQuery(
        `SELECT COUNT(DISTINCT tm.tournament_id) as cnt
         FROM TournamentTeams tm
         JOIN Tournaments t ON tm.tournament_id = t.tournament_id
         WHERE tm.team_id IN (${ph}) AND t.status = 'completed'${clanFilter}`,
        [...teamIds, ...clanParam]
      ),
      executeQuery(
        `SELECT COUNT(*) as cnt FROM Tournaments t
         WHERE t.winner_team_id IN (${ph}) AND t.status = 'completed'${clanFilter}`,
        [...teamIds, ...clanParam]
      ),
      executeQuery(
        `SELECT COUNT(*) as cnt
         FROM TournamentMatches tm
         JOIN Tournaments t ON tm.tournament_id = t.tournament_id
         WHERE tm.match_stage = 'Final'
           AND tm.winner_team_id IS NOT NULL
           AND t.status = 'completed'
           AND (
             (tm.team1_id IN (${ph}) AND tm.winner_team_id != tm.team1_id)
             OR
             (tm.team2_id IN (${ph}) AND tm.winner_team_id != tm.team2_id)
           )${clanFilter}`,
        [...teamIds, ...teamIds, ...clanParam]
      ),
    ]);

    return NextResponse.json({
      played:    Number((playedRows as { cnt: number }[])[0]?.cnt) || 0,
      won:       Number((wonRows   as { cnt: number }[])[0]?.cnt) || 0,
      runner_up: Number((ruRows    as { cnt: number }[])[0]?.cnt) || 0,
    });
  } catch (error) {
    console.error("Error fetching tournament stats:", error);
    return NextResponse.json({ error: "Failed to fetch tournament stats" }, { status: 500 });
  }
}
