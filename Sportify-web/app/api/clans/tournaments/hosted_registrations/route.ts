import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get("tournamentId");

    if (!tournamentId) {
      return NextResponse.json({ success: false, error: "Tournament ID required" }, { status: 400 });
    }

    const rows = await executeQuery(
      `SELECT tournament_id, clan_id, tournament_name, tournament_type, format,
              status, max_participants, registration_mode, teams_per_group
       FROM Tournaments WHERE tournament_id = ?`,
      [tournamentId]
    ) as RowDataPacket[];

    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    const tournament = rows[0];

    const registrations = await executeQuery(
      `SELECT registration_id, user_id, user_name, hosted_team_id, registered_at
       FROM HostedTournamentRegistrations WHERE tournament_id = ? ORDER BY registered_at ASC`,
      [tournamentId]
    ) as RowDataPacket[];

    const teams = await executeQuery(
      `SELECT ht.hosted_team_id, ht.team_name, ht.created_by_user_name,
              COUNT(r.registration_id) AS member_count
       FROM HostedTournamentTeams ht
       LEFT JOIN HostedTournamentRegistrations r ON r.hosted_team_id = ht.hosted_team_id
       WHERE ht.tournament_id = ?
       GROUP BY ht.hosted_team_id
       ORDER BY ht.created_at ASC`,
      [tournamentId]
    ) as RowDataPacket[];

    return NextResponse.json({ success: true, tournament, registrations, teams });
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch registrations" }, { status: 500 });
  }
}
