import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";

function roundRobinMatches(teamIds: number[], prefix: string) {
  const matches: { team1_id: number; team2_id: number; match_stage: string; pos: number }[] = [];
  let pos = 0, n = 1;
  for (let i = 0; i < teamIds.length; i++)
    for (let j = i + 1; j < teamIds.length; j++)
      matches.push({ team1_id: teamIds[i], team2_id: teamIds[j], match_stage: prefix ? `${prefix} - Match ${n++}` : `Match ${n++}`, pos: pos++ });
  return matches;
}

function knockoutRound1Matches(teamIds: number[]) {
  const isFinal = teamIds.length <= 2;
  return Array.from({ length: Math.ceil(teamIds.length / 2) }, (_, i) => ({
    team1_id:    teamIds[i * 2],
    team2_id:    teamIds[i * 2 + 1] ?? null,
    match_stage: isFinal ? "Final" : `Round 1 - Match ${i + 1}`,
    pos: i,
  }));
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();
  try {
    await connection.beginTransaction();

    const { tournamentId } = await req.json();
    if (!tournamentId) {
      return NextResponse.json({ success: false, error: "Missing tournament ID" }, { status: 400 });
    }

    const tournament = await getManagedTournament(uid, tournamentId);
    if (!tournament) {
      await connection.rollback();
      return forbidden("Only the tournament host or a clan admin can start this tournament");
    }

    // Fetch tournament
    const [tRows] = await connection.execute<RowDataPacket[]>(
      `SELECT tournament_id, clan_id, format, tournament_type, registration_mode, teams_per_group
       FROM Tournaments WHERE tournament_id = ? AND status = 'open'`,
      [tournamentId]
    );
    if (!tRows.length) {
      return NextResponse.json({ success: false, error: "Tournament not found or already started" }, { status: 404 });
    }
    const t = tRows[0];

    // Build team definitions from registrations
    type TeamDef = { team_name: string; players: string };
    let teamsData: TeamDef[] = [];

    if (t.registration_mode === "teams") {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT ht.hosted_team_id, ht.team_name,
                GROUP_CONCAT(JSON_OBJECT('user_id', r.user_id, 'name', r.user_name)) AS members_raw
         FROM HostedTournamentTeams ht
         LEFT JOIN HostedTournamentRegistrations r ON r.hosted_team_id = ht.hosted_team_id
         WHERE ht.tournament_id = ?
         GROUP BY ht.hosted_team_id
         ORDER BY ht.created_at ASC`,
        [tournamentId]
      );
      teamsData = rows.map(r => ({
        team_name: r.team_name,
        players:   r.members_raw ? `[${r.members_raw}]` : "[]",
      }));
    } else {
      // Player mode
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT user_id, user_name FROM HostedTournamentRegistrations WHERE tournament_id = ? ORDER BY registered_at ASC`,
        [tournamentId]
      );
      if (t.tournament_type === "singles") {
        teamsData = rows.map(r => ({
          team_name: r.user_name,
          players:   JSON.stringify([{ user_id: r.user_id, name: r.user_name }]),
        }));
      } else {
        // Doubles: sequential pairing
        if (rows.length % 2 !== 0) {
          await connection.rollback();
          return NextResponse.json({ success: false, error: "Doubles requires an even number of players" }, { status: 400 });
        }
        for (let i = 0; i < rows.length; i += 2) {
          const a = rows[i], b = rows[i + 1];
          teamsData.push({
            team_name: `${a.user_name} & ${b.user_name}`,
            players:   JSON.stringify([{ user_id: a.user_id, name: a.user_name }, { user_id: b.user_id, name: b.user_name }]),
          });
        }
      }
    }

    if (teamsData.length < 2) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Need at least 2 teams / players to start" }, { status: 400 });
    }
    if (t.format === "knockout" && teamsData.length % 2 !== 0) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Knockout requires an even number of teams" }, { status: 400 });
    }

    // Insert TournamentTeams, collect IDs
    const teamIds: number[] = [];
    for (const td of teamsData) {
      const [res] = await connection.execute<ResultSetHeader>(
        `INSERT INTO TournamentTeams (tournament_id, team_name, players) VALUES (?, ?, ?)`,
        [tournamentId, td.team_name, td.players]
      );
      teamIds.push(res.insertId);
    }

    const insertMatch = async (team1_id: number, team2_id: number | null, match_stage: string, round: number, pos: number) =>
      connection.execute(
        `INSERT INTO TournamentMatches (tournament_id, team1_id, team2_id, match_stage, round_number, match_position) VALUES (?, ?, ?, ?, ?, ?)`,
        [tournamentId, team1_id, team2_id, match_stage, round, pos]
      );

    if (t.format === "round_robin") {
      for (const m of roundRobinMatches(teamIds, "")) await insertMatch(m.team1_id, m.team2_id, m.match_stage, 1, m.pos);

    } else if (t.format === "knockout") {
      for (const m of knockoutRound1Matches(teamIds)) await insertMatch(m.team1_id, m.team2_id, m.match_stage, 1, m.pos);

    } else if (t.format === "group_knockout") {
      const tpg = Math.max(2, t.teams_per_group || 4);
      for (let gi = 0; gi * tpg < teamIds.length; gi++) {
        const groupIds  = teamIds.slice(gi * tpg, gi * tpg + tpg);
        const groupName = `Group ${String.fromCharCode(65 + gi)}`;
        const [grpRes]  = await connection.execute<ResultSetHeader>(
          `INSERT INTO TournamentGroups (tournament_id, group_name, match_repeat_count) VALUES (?, ?, 1)`,
          [tournamentId, groupName]
        );
        for (const tid of groupIds)
          await connection.execute(`INSERT INTO TournamentGroupTeams (group_id, team_id) VALUES (?, ?)`, [grpRes.insertId, tid]);
        for (const m of roundRobinMatches(groupIds, groupName))
          await insertMatch(m.team1_id, m.team2_id, m.match_stage, 1, m.pos);
      }
    }

    await connection.execute(
      `UPDATE Tournaments SET status = 'ongoing', start_date = NOW() WHERE tournament_id = ?`,
      [tournamentId]
    );

    await connection.commit();
    return NextResponse.json({ success: true, tournament_id: tournamentId });
  } catch (error) {
    await connection.rollback();
    console.error("Error starting hosted tournament:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to start tournament" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
