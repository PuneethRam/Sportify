import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

function roundRobinMatches(
  teamIds: number[],
  stagePrefix: string,
  roundNumber: number,
  startPos: number
) {
  const matches: { team1_id: number; team2_id: number; match_stage: string; round_number: number; match_position: number }[] = [];
  let pos = startPos;
  let matchNum = 1;
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const stageName = stagePrefix ? `${stagePrefix} - Match ${matchNum}` : `Match ${matchNum}`;
      matches.push({
        team1_id: teamIds[i],
        team2_id: teamIds[j],
        match_stage: stageName,
        round_number: roundNumber,
        match_position: pos++,
      });
      matchNum++;
    }
  }
  return matches;
}

function knockoutRound1Matches(teamIds: number[]) {
  const matches: { team1_id: number; team2_id: number | null; match_stage: string; round_number: number; match_position: number }[] = [];
  const isFinalOnly = teamIds.length <= 2;
  for (let i = 0; i < teamIds.length; i += 2) {
    const pos = Math.floor(i / 2);
    matches.push({
      team1_id: teamIds[i],
      team2_id: teamIds[i + 1] ?? null,
      match_stage: isFinalOnly ? "Final" : `Round 1 - Match ${pos + 1}`,
      round_number: 1,
      match_position: pos,
    });
  }
  return matches;
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();
  try {
    await connection.beginTransaction();

    const { clanId, tournament_name, tournament_type, format, start_date, teams: teamsData, groups: groupsData, teams_per_group } =
      await req.json();

    if (!clanId || !tournament_name || !tournament_type || !format || !start_date || !teamsData?.length) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (format === "knockout" && teamsData.length % 2 !== 0) {
      return NextResponse.json(
        { success: false, error: "Knockout format requires an even number of teams" },
        { status: 400 }
      );
    }

    // 1. Create tournament
    const [tournResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO Tournaments (clan_id, tournament_name, tournament_type, format, status, start_date, teams_per_group)
       VALUES (?, ?, ?, ?, 'ongoing', ?, ?)`,
      [clanId, tournament_name, tournament_type, format, start_date, teams_per_group ?? 2]
    );
    const tournamentId = tournResult.insertId;

    // 2. Insert teams, collect IDs
    const teamIds: number[] = [];
    for (const team of teamsData) {
      const [res] = await connection.execute<ResultSetHeader>(
        `INSERT INTO TournamentTeams (tournament_id, team_name, players) VALUES (?, ?, ?)`,
        [tournamentId, team.team_name, team.players]
      );
      teamIds.push(res.insertId);
    }

    // 3. Generate matches
    const insertMatch = async (
      team1_id: number,
      team2_id: number | null,
      match_stage: string,
      round_number: number,
      match_position: number
    ) => {
      await connection.execute(
        `INSERT INTO TournamentMatches (tournament_id, team1_id, team2_id, match_stage, round_number, match_position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tournamentId, team1_id, team2_id, match_stage, round_number, match_position]
      );
    };

    if (format === "round_robin") {
      const matches = roundRobinMatches(teamIds, "", 1, 0);
      for (const m of matches) {
        await insertMatch(m.team1_id, m.team2_id, m.match_stage, m.round_number, m.match_position);
      }
    } else if (format === "knockout") {
      const matches = knockoutRound1Matches(teamIds);
      for (const m of matches) {
        await insertMatch(m.team1_id, m.team2_id, m.match_stage, m.round_number, m.match_position);
      }
    } else if (format === "group_knockout") {
      for (const group of groupsData ?? []) {
        const [groupRes] = await connection.execute<ResultSetHeader>(
          `INSERT INTO TournamentGroups (tournament_id, group_name, match_repeat_count) VALUES (?, ?, ?)`,
          [tournamentId, group.group_name, group.match_repeat_count ?? 1]
        );
        const groupId = groupRes.insertId;

        const groupTeamIds: number[] = (group.teams as number[]).map((idx) => teamIds[idx]);

        for (const teamId of groupTeamIds) {
          await connection.execute(
            `INSERT INTO TournamentGroupTeams (group_id, team_id) VALUES (?, ?)`,
            [groupId, teamId]
          );
        }

        for (let rep = 0; rep < (group.match_repeat_count ?? 1); rep++) {
          const prefix =
            (group.match_repeat_count ?? 1) > 1 ? `${group.group_name} - Leg ${rep + 1}` : group.group_name;
          const matches = roundRobinMatches(groupTeamIds, prefix, 1, 0);
          for (const m of matches) {
            await insertMatch(m.team1_id, m.team2_id, m.match_stage, m.round_number, m.match_position);
          }
        }
      }
    }

    await connection.commit();
    return NextResponse.json({ success: true, tournament_id: tournamentId }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating tournament:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create tournament" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
