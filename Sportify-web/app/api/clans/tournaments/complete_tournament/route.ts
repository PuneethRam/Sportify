import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { countOpenTournamentResults, waitingForConfirmation } from "@/lib/tournamentResults";

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
      return forbidden("Only the tournament host or a clan admin can complete this tournament");
    }

    // A result waiting for confirmation could still change the winner
    const waiting = await countOpenTournamentResults(connection, tournamentId);
    if (waiting) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: waitingForConfirmation(waiting) }, { status: 409 });
    }

    const [tournaments] = await connection.execute<RowDataPacket[]>(
      `SELECT format FROM Tournaments WHERE tournament_id = ? AND clan_id = ?`,
      [tournamentId, clanId]
    );

    if (!tournaments.length) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    const format: string = tournaments[0].format;
    let winnerId: number | null = null;

    if (format === "knockout") {
      // Pure knockout: winner is the last match winner (highest round)
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT winner_team_id FROM TournamentMatches
         WHERE tournament_id = ? AND winner_team_id IS NOT NULL
         ORDER BY round_number DESC, match_id DESC LIMIT 1`,
        [tournamentId]
      );
      winnerId = rows[0]?.winner_team_id ?? null;
    } else {
      // Check if there are completed knockout-phase matches (round_robin advanced, or group_knockout)
      const [knockoutCheck] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM TournamentMatches
         WHERE tournament_id = ? AND phase = 'knockout' AND winner_team_id IS NOT NULL`,
        [tournamentId]
      );
      if (knockoutCheck[0].cnt > 0) {
        // Use the final knockout match winner
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT winner_team_id FROM TournamentMatches
           WHERE tournament_id = ? AND phase = 'knockout' AND winner_team_id IS NOT NULL
           ORDER BY round_number DESC, match_id DESC LIMIT 1`,
          [tournamentId]
        );
        winnerId = rows[0]?.winner_team_id ?? null;
      } else {
        // Pure round robin: team with most wins
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT winner_team_id, COUNT(*) AS wins FROM TournamentMatches
           WHERE tournament_id = ? AND winner_team_id IS NOT NULL
           GROUP BY winner_team_id ORDER BY wins DESC LIMIT 1`,
          [tournamentId]
        );
        winnerId = rows[0]?.winner_team_id ?? null;
      }
    }

    await connection.execute(
      `UPDATE Tournaments SET status = 'completed', winner_team_id = ?, end_date = CURRENT_TIMESTAMP
       WHERE tournament_id = ? AND clan_id = ?`,
      [winnerId, tournamentId, clanId]
    );

    await connection.commit();
    return NextResponse.json({ success: true, winner_team_id: winnerId });
  } catch (error) {
    await connection.rollback();
    console.error("Error completing tournament:", error);
    return NextResponse.json(
      { success: false, error: "Failed to complete tournament" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
