import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { loadRatingChanges } from "@/lib/ratings";
import { getManagedTournament } from "@/lib/authz";
import { canResolve, Submission } from "@/lib/matchSubmissions";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("clanId");
    const tournamentId = searchParams.get("tournamentId");

    if (!clanId || !tournamentId) {
      return NextResponse.json(
        { success: false, error: "clanId and tournamentId required" },
        { status: 400 }
      );
    }

    // Tournament + optional winner team name
    const tournaments = await executeQuery(
      `SELECT t.tournament_id, t.clan_id, t.tournament_name, t.tournament_type, t.format,
              t.status, t.start_date, t.end_date, t.winner_team_id, t.teams_per_group,
              wt.team_name AS winner_team_name
       FROM Tournaments t
       LEFT JOIN TournamentTeams wt ON t.winner_team_id = wt.team_id
       WHERE t.tournament_id = ? AND t.clan_id = ?`,
      [tournamentId, clanId]
    ) as RowDataPacket[];

    if (!tournaments.length) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    const tournament = { ...tournaments[0] };
    if (tournament.winner_team_id) {
      tournament.winnerTeam = {
        team_id: tournament.winner_team_id,
        team_name: tournament.winner_team_name,
      };
    }
    delete tournament.winner_team_name;

    // Teams
    const teams = await executeQuery(
      `SELECT team_id, team_name, players FROM TournamentTeams WHERE tournament_id = ? ORDER BY team_id ASC`,
      [tournamentId]
    ) as RowDataPacket[];

    // Parse players column — two formats exist:
    //   teams mode:  ["uid1", "uid2"]
    //   player mode: [{"user_id":"uid","name":"..."}]
    type PlayerEntry = { user_id: string; storedName?: string };
    function parsePlayers(raw: string): PlayerEntry[] {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .map((item) => {
            if (typeof item === "string") return { user_id: item };
            if (item && typeof item === "object" && item.user_id)
              return { user_id: String(item.user_id), storedName: item.name ?? undefined };
            return null;
          })
          .filter((x): x is PlayerEntry => x !== null);
      } catch { return []; }
    }

    // Collect all player IDs across all teams for a single Users lookup
    const allPlayerIds = new Set<string>();
    const teamPlayerEntries: PlayerEntry[][] = teams.map((team) => {
      const entries = parsePlayers(String(team.players));
      entries.forEach((e) => allPlayerIds.add(e.user_id));
      return entries;
    });

    const userMap: Record<string, string> = {};
    if (allPlayerIds.size > 0) {
      const placeholders = Array.from(allPlayerIds).map(() => "?").join(",");
      const users = await executeQuery(
        `SELECT user_id, name FROM Users WHERE user_id IN (${placeholders})`,
        Array.from(allPlayerIds)
      ) as RowDataPacket[];
      users.forEach((u) => { userMap[u.user_id] = u.name; });
    }

    const enrichedTeams = teams.map((team, i) => ({
      ...team,
      playersDetails: teamPlayerEntries[i].map((e) => ({
        user_id: e.user_id,
        // Prefer live DB name, fall back to name stored in JSON at registration time
        name: userMap[e.user_id] || e.storedName || "Unknown",
      })),
    }));

    // Matches (include player selections)
    const matches = await executeQuery(
      `SELECT match_id, team1_id, team2_id, winner_team_id, score_details,
              match_stage, match_date, round_number, match_position, phase,
              team1_players, team2_players
       FROM TournamentMatches
       WHERE tournament_id = ?
       ORDER BY round_number ASC, match_position ASC`,
      [tournamentId]
    ) as RowDataPacket[];

    // Glicko-2 rating change per player for each rated match
    const changes = await loadRatingChanges("tournament", matches.map(m => Number(m.match_id)));
    matches.forEach(m => { m.rating_changes = changes.get(Number(m.match_id)) ?? {}; });

    // Results waiting for confirmation (the recorder played in the match).
    // They don't count yet: winner_team_id stays null until confirmed.
    const open = matches.length ? await executeQuery(
      `SELECT ms.*, u.name AS submitted_by_name FROM MatchSubmissions ms
       LEFT JOIN Users u ON u.user_id = ms.submitted_by
       WHERE ms.status IN ('pending', 'disputed')
         AND ms.tournament_match_id IN (${matches.map(() => "?").join(",")})`,
      matches.map(m => m.match_id)
    ) as (Submission & RowDataPacket)[] : [];
    const manager = open.length > 0 && !!(await getManagedTournament(uid, tournamentId));
    const byMatch = new Map(open.map(s => [Number(s.tournament_match_id), s]));
    matches.forEach(m => {
      const s = byMatch.get(Number(m.match_id));
      m.pending_result = s ? {
        submissionId:    s.submission_id,
        status:          s.status,
        winnerTeamId:    s.winner === "team1" ? m.team1_id : s.winner === "team2" ? m.team2_id : null,
        score_details:   s.score_details,
        team1_players:   [s.team1_player1, s.team1_player2].filter(Boolean),
        team2_players:   [s.team2_player1, s.team2_player2].filter(Boolean),
        submittedBy:     s.submitted_by,
        submittedByName: s.submitted_by_name ?? "Unknown",
        canConfirm:      canResolve(s, uid, manager),
      } : null;
    });

    // Groups (only relevant for group_knockout)
    const groups = await executeQuery(
      `SELECT group_id, group_name, match_repeat_count FROM TournamentGroups WHERE tournament_id = ?`,
      [tournamentId]
    ) as RowDataPacket[];

    for (const group of groups) {
      const groupTeams = await executeQuery(
        `SELECT t.team_id, t.team_name, t.players
         FROM TournamentTeams t
         JOIN TournamentGroupTeams gt ON t.team_id = gt.team_id
         WHERE gt.group_id = ?`,
        [group.group_id]
      ) as RowDataPacket[];
      group.teams = groupTeams;
    }

    return NextResponse.json({
      success: true,
      tournament,
      teams: enrichedTeams,
      matches,
      groups,
    });
  } catch (error) {
    console.error("Error fetching tournament details:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch tournament details" },
      { status: 500 }
    );
  }
}
