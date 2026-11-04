import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();
  try {
    await connection.beginTransaction();

    const { clanId, tournamentId } = await req.json();

    if (!clanId || !tournamentId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const tournament = await getManagedTournament(uid, tournamentId);
    if (!tournament || String(tournament.clan_id) !== String(clanId)) {
      await connection.rollback();
      return forbidden("Only the tournament host or a clan admin can start the knockout stage");
    }

    // Get tournament config
    const [tournaments] = await connection.execute<RowDataPacket[]>(
      `SELECT teams_per_group FROM Tournaments WHERE tournament_id = ? AND clan_id = ?`,
      [tournamentId, clanId]
    );
    if (!tournaments.length) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    const teamsPerGroup = tournaments[0].teams_per_group ?? 2;

    // Get all groups
    const [groups] = await connection.execute<RowDataPacket[]>(
      `SELECT group_id FROM TournamentGroups WHERE tournament_id = ?`,
      [tournamentId]
    );

    // Collect top N from each group, grouped by position (1st place, 2nd place...)
    // advancingByPosition[0] = all group winners, [1] = all runners-up, etc.
    const advancingByPosition: number[][] = Array.from({ length: teamsPerGroup }, () => []);

    for (const group of groups) {
      const [groupTeamRows] = await connection.execute<RowDataPacket[]>(
        `SELECT team_id FROM TournamentGroupTeams WHERE group_id = ?`,
        [group.group_id]
      );
      const teamIds: number[] = groupTeamRows.map((r) => r.team_id);
      if (!teamIds.length) continue;

      // Tally wins for each team within this group's matches
      const wins: Record<number, number> = {};
      teamIds.forEach((id) => { wins[id] = 0; });

      const ph = teamIds.map(() => "?").join(",");
      const [groupMatches] = await connection.execute<RowDataPacket[]>(
        `SELECT winner_team_id FROM TournamentMatches
         WHERE tournament_id = ? AND phase = 'group'
           AND team1_id IN (${ph}) AND team2_id IN (${ph})
           AND winner_team_id IS NOT NULL`,
        [tournamentId, ...teamIds, ...teamIds]
      );
      groupMatches.forEach((m) => {
        if (wins[m.winner_team_id] !== undefined) wins[m.winner_team_id]++;
      });

      // Sort by wins DESC
      const sorted = [...teamIds].sort((a, b) => wins[b] - wins[a]);

      for (let pos = 0; pos < teamsPerGroup && pos < sorted.length; pos++) {
        advancingByPosition[pos].push(sorted[pos]);
      }
    }

    // Cross-pairing: 1st place teams vs runners-up in reverse order
    // e.g. 2 groups advancing 2: 1stA vs 2ndB, 1stB vs 2ndA
    const winners = advancingByPosition[0] ?? [];
    const runnersUp = advancingByPosition[1] ?? [];
    const matchups: [number, number][] = [];

    if (teamsPerGroup >= 2 && winners.length > 0 && runnersUp.length > 0) {
      for (let i = 0; i < winners.length; i++) {
        const opponent = runnersUp[runnersUp.length - 1 - i];
        if (opponent !== undefined) matchups.push([winners[i], opponent]);
      }
      // Any unmatched winners (if groups are uneven)
      if (winners.length > runnersUp.length) {
        for (let i = runnersUp.length; i < winners.length; i += 2) {
          if (i + 1 < winners.length) matchups.push([winners[i], winners[i + 1]]);
        }
      }
    } else {
      // Only 1 team per group — pair winners sequentially
      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) matchups.push([winners[i], winners[i + 1]]);
      }
    }

    if (!matchups.length) {
      return NextResponse.json({ success: false, error: "Not enough advancing teams to generate knockout" }, { status: 400 });
    }

    // Find the next round number (above all existing matches)
    const [maxRoundResult] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(round_number), 0) AS maxRound FROM TournamentMatches WHERE tournament_id = ?`,
      [tournamentId]
    );
    const knockoutRound = (maxRoundResult[0].maxRound ?? 0) + 1;

    const stageName = (idx: number) => {
      const n = matchups.length;
      if (n === 1) return "Final";
      if (n === 2) return `Semi Final - Match ${idx + 1}`;
      if (n === 4) return `Quarter Final - Match ${idx + 1}`;
      return `Knockout Round - Match ${idx + 1}`;
    };

    for (let i = 0; i < matchups.length; i++) {
      const [team1, team2] = matchups[i];
      await connection.execute<ResultSetHeader>(
        `INSERT INTO TournamentMatches
         (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
         VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
        [tournamentId, team1, team2, stageName(i), knockoutRound, i]
      );
    }

    await connection.commit();
    return NextResponse.json({ success: true, matchups: matchups.length, round: knockoutRound });
  } catch (error) {
    await connection.rollback();
    console.error("Error starting knockout:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to start knockout" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
