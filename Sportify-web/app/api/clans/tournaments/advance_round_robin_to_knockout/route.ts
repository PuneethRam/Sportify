import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";

function getStageName(matchCount: number, pos: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return `Semi Final - Match ${pos + 1}`;
  if (matchCount === 4) return `Quarter Final - Match ${pos + 1}`;
  return `Knockout Round - Match ${pos + 1}`;
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();
  try {
    await connection.beginTransaction();

    const { clanId, tournamentId, advancingCount } = await req.json();

    if (!clanId || !tournamentId || !advancingCount || advancingCount < 2) {
      return NextResponse.json({ success: false, error: "Missing or invalid fields" }, { status: 400 });
    }

    const tournament = await getManagedTournament(uid, tournamentId);
    if (!tournament || String(tournament.clan_id) !== String(clanId)) {
      await connection.rollback();
      return forbidden("Only the tournament host or a clan admin can advance this tournament");
    }

    const [tournaments] = await connection.execute<RowDataPacket[]>(
      `SELECT format FROM Tournaments WHERE tournament_id = ? AND clan_id = ?`,
      [tournamentId, clanId]
    );
    if (!tournaments.length) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }
    if (tournaments[0].format !== "round_robin") {
      return NextResponse.json({ success: false, error: "Only applicable to round robin format" }, { status: 400 });
    }

    // Tally wins per team from round-robin matches
    const [matchRows] = await connection.execute<RowDataPacket[]>(
      `SELECT team1_id, team2_id, winner_team_id FROM TournamentMatches
       WHERE tournament_id = ? AND phase = 'group'`,
      [tournamentId]
    );

    const wins: Record<number, number> = {};
    const teamSet = new Set<number>();
    matchRows.forEach((m) => {
      teamSet.add(m.team1_id);
      teamSet.add(m.team2_id);
      if (m.winner_team_id !== null) {
        wins[m.winner_team_id] = (wins[m.winner_team_id] ?? 0) + 1;
      }
    });
    teamSet.forEach((id) => { if (wins[id] === undefined) wins[id] = 0; });

    const sorted = [...teamSet].sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0));
    const advancing = sorted.slice(0, advancingCount);

    if (advancing.length < 2) {
      return NextResponse.json({ success: false, error: "Not enough teams to generate knockout" }, { status: 400 });
    }

    const [maxRoundResult] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(round_number), 0) AS maxRound FROM TournamentMatches WHERE tournament_id = ?`,
      [tournamentId]
    );
    const knockoutRound = (maxRoundResult[0].maxRound ?? 0) + 1;

    // Seeded bracket: #1 vs #last, #2 vs #second-last, ...
    const matchups: [number, number][] = [];
    for (let i = 0; i < Math.floor(advancing.length / 2); i++) {
      matchups.push([advancing[i], advancing[advancing.length - 1 - i]]);
    }

    for (let i = 0; i < matchups.length; i++) {
      const [team1, team2] = matchups[i];
      await connection.execute<ResultSetHeader>(
        `INSERT INTO TournamentMatches
         (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
         VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
        [tournamentId, team1, team2, getStageName(matchups.length, i), knockoutRound, i]
      );
    }

    await connection.commit();
    return NextResponse.json({ success: true, matchups: matchups.length, round: knockoutRound });
  } catch (error) {
    await connection.rollback();
    console.error("Error advancing to knockout:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
