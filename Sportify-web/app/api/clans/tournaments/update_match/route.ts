import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { applyResult } from "@/lib/scoring";

function getStageName(matchCount: number, roundNumber: number, position: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return `Semi Final - Match ${position + 1}`;
  if (matchCount === 4) return `Quarter Final - Match ${position + 1}`;
  return `Round ${roundNumber} - Match ${position + 1}`;
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { tournamentId, matchId, winner_team_id, score_details, team1_players, team2_players } = await req.json();

  if (!tournamentId || !matchId) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  // Only the tournament host or a clan admin records tournament results
  const tournament = await getManagedTournament(uid, tournamentId);
  if (!tournament) return forbidden("Only the tournament host or a clan admin can record results");

  const connection = await createConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT team1_id, team2_id, winner_team_id FROM TournamentMatches WHERE match_id = ? AND tournament_id = ? FOR UPDATE`,
      [matchId, tournamentId]
    );
    if (!existing.length) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }
    // A recorded result has already moved the leaderboard and the bracket;
    // recording it again would count it twice.
    if (existing[0].winner_team_id !== null) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "This match already has a result" }, { status: 409 });
    }
    const team1Id = existing[0].team1_id;
    if (winner_team_id && winner_team_id !== team1Id && winner_team_id !== existing[0].team2_id) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Winner must be one of the two teams" }, { status: 400 });
    }

    // Serialize player selections if provided
    const t1Players = Array.isArray(team1_players) ? JSON.stringify(team1_players) : null;
    const t2Players = Array.isArray(team2_players) ? JSON.stringify(team2_players) : null;

    // Update match score, winner, and player selections
    await connection.execute(
      `UPDATE TournamentMatches
       SET winner_team_id = ?, score_details = ?,
           team1_players = COALESCE(?, team1_players),
           team2_players = COALESCE(?, team2_players)
       WHERE match_id = ? AND tournament_id = ?`,
      [winner_team_id ?? null, score_details ?? null, t1Players, t2Players, matchId, tournamentId]
    );

    const format: string = tournament.format ?? "";
    const clanId: number = tournament.clan_id;

    // ── Leaderboard update (fires whenever a winner is declared and players are known) ──
    if (winner_team_id && Array.isArray(team1_players) && Array.isArray(team2_players)) {
      // Frontend sends plain string user-id arrays e.g. ["uid1", "uid2"]
      await applyResult(connection, {
        clanId,
        format: tournament.tournament_type === "doubles" ? "doubles" : "singles",
        team1: team1_players,
        team2: team2_players,
        score: score_details ?? "",
        winner: winner_team_id === team1Id ? "team1" : "team2",
      });
    }

    // Advance bracket for knockout and group_knockout knockout phase
    if (winner_team_id && (format === "knockout" || format === "group_knockout" || format === "round_robin")) {
      const [matchRows] = await connection.execute<RowDataPacket[]>(
        `SELECT round_number, phase FROM TournamentMatches WHERE match_id = ?`,
        [matchId]
      );

      if (matchRows.length > 0) {
        const { round_number, phase } = matchRows[0];

        // For group_knockout and round_robin, only advance bracket in the knockout phase
        if ((format === "group_knockout" || format === "round_robin") && phase !== "knockout") {
          await connection.commit();
          return NextResponse.json({ success: true });
        }

        const [pending] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM TournamentMatches
           WHERE tournament_id = ? AND round_number = ? AND winner_team_id IS NULL`,
          [tournamentId, round_number]
        );

        if (pending[0].cnt === 0) {
          const [roundMatches] = await connection.execute<RowDataPacket[]>(
            `SELECT winner_team_id, match_position FROM TournamentMatches
             WHERE tournament_id = ? AND round_number = ?
             ORDER BY match_position ASC`,
            [tournamentId, round_number]
          );

          if (roundMatches.length > 1) {
            const nextRound = round_number + 1;
            const nextMatchCount = Math.floor(roundMatches.length / 2);

            for (let i = 0; i < roundMatches.length; i += 2) {
              const team1 = roundMatches[i].winner_team_id;
              const team2 = roundMatches[i + 1]?.winner_team_id ?? null;
              const pos = Math.floor(i / 2);
              const stageName = getStageName(nextMatchCount, nextRound, pos);

              await connection.execute<ResultSetHeader>(
                `INSERT INTO TournamentMatches
                 (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
                 VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
                [tournamentId, team1, team2, stageName, nextRound, pos]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating tournament match:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update match" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
