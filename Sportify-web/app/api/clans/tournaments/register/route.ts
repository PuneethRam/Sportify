import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { tournamentId, userName, action, teamName, hostedTeamId } = await req.json();

    if (!tournamentId || !userName || !action) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // Already registered?
    const existing = await executeQuery(
      `SELECT registration_id FROM HostedTournamentRegistrations WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, uid]
    ) as RowDataPacket[];
    if (existing.length) {
      return NextResponse.json({ success: false, error: "Already registered for this tournament" }, { status: 409 });
    }

    // Tournament open?
    const tourn = await executeQuery(
      `SELECT max_participants, registration_mode FROM Tournaments WHERE tournament_id = ? AND status = 'open'`,
      [tournamentId]
    ) as RowDataPacket[];
    if (!tourn.length) {
      return NextResponse.json({ success: false, error: "Tournament not found or not open for registration" }, { status: 404 });
    }

    const { max_participants } = tourn[0];
    let teamIdToAssign: number | null = null;

    if (action === "create_team") {
      if (!teamName?.trim()) {
        return NextResponse.json({ success: false, error: "Team name is required" }, { status: 400 });
      }
      // Max teams reached?
      if (max_participants > 0) {
        const counts = await executeQuery(
          `SELECT COUNT(*) AS team_count FROM HostedTournamentTeams WHERE tournament_id = ?`,
          [tournamentId]
        ) as RowDataPacket[];
        if ((counts[0]?.team_count ?? 0) >= max_participants) {
          return NextResponse.json({ success: false, error: `Maximum of ${max_participants} teams has been reached` }, { status: 400 });
        }
      }
      const result = await executeQuery(
        `INSERT INTO HostedTournamentTeams (tournament_id, team_name, created_by_user_id, created_by_user_name) VALUES (?, ?, ?, ?)`,
        [tournamentId, teamName.trim(), uid, userName]
      ) as ResultSetHeader;
      teamIdToAssign = result.insertId;

    } else if (action === "join_team") {
      if (!hostedTeamId) {
        return NextResponse.json({ success: false, error: "Team ID is required" }, { status: 400 });
      }
      // Verify team belongs to this tournament
      const team = await executeQuery(
        `SELECT hosted_team_id FROM HostedTournamentTeams WHERE hosted_team_id = ? AND tournament_id = ?`,
        [hostedTeamId, tournamentId]
      ) as RowDataPacket[];
      if (!team.length) {
        return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
      }
      teamIdToAssign = hostedTeamId;

    } else if (action === "join_player") {
      // Check player capacity
      if (max_participants > 0) {
        const counts = await executeQuery(
          `SELECT COUNT(*) AS reg_count FROM HostedTournamentRegistrations WHERE tournament_id = ?`,
          [tournamentId]
        ) as RowDataPacket[];
        if ((counts[0]?.reg_count ?? 0) >= max_participants) {
          return NextResponse.json({ success: false, error: "Tournament is full" }, { status: 400 });
        }
      }
    } else {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    await executeQuery(
      `INSERT INTO HostedTournamentRegistrations (tournament_id, user_id, user_name, hosted_team_id) VALUES (?, ?, ?, ?)`,
      [tournamentId, uid, userName, teamIdToAssign]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error registering:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to register" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get("tournamentId");

    if (!tournamentId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    await executeQuery(
      `DELETE FROM HostedTournamentRegistrations WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, uid]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to unregister" }, { status: 500 });
  }
}
