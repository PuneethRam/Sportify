import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { recomputeRatings } from "@/lib/ratings";

export async function DELETE(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get("tournamentId");
    const clanId       = searchParams.get("clanId");

    if (!tournamentId || !clanId) {
      return NextResponse.json({ success: false, error: "Missing tournamentId or clanId" }, { status: 400 });
    }

    const tournament = await getManagedTournament(uid, tournamentId);
    if (!tournament || String(tournament.clan_id) !== String(clanId)) {
      return forbidden("Only the tournament host or a clan admin can delete it");
    }

    // Child records first (FK ordering)
    await executeQuery(`DELETE FROM TournamentGroupTeams WHERE group_id IN (SELECT group_id FROM TournamentGroups WHERE tournament_id = ?)`, [tournamentId]);
    await executeQuery(`DELETE FROM TournamentGroups WHERE tournament_id = ?`, [tournamentId]);
    await executeQuery(`DELETE FROM TournamentMatches WHERE tournament_id = ?`, [tournamentId]);
    await executeQuery(`DELETE FROM TournamentTeams WHERE tournament_id = ?`, [tournamentId]);

    await executeQuery(`DELETE FROM HostedTournamentRegistrations WHERE tournament_id = ?`, [tournamentId]);
    await executeQuery(`DELETE FROM HostedTournamentTeams WHERE tournament_id = ?`, [tournamentId]);

    const result = await executeQuery(
      `DELETE FROM Tournaments WHERE tournament_id = ? AND clan_id = ?`,
      [tournamentId, clanId]
    ) as ResultSetHeader;

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    // Its results no longer count: rebuild ratings from what's left
    await recomputeRatings();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tournament:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete tournament" },
      { status: 500 }
    );
  }
}
