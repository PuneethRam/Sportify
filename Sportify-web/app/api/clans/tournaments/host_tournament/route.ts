import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin } from "@/lib/authz";

export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { clanId, tournament_name, tournament_type, format, registration_mode, max_participants, teams_per_group } =
      await req.json();

    if (!clanId || !tournament_name || !tournament_type || !format) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (!(await isClanAdmin(uid, clanId))) return forbidden("Only clan admins can host tournaments");

    const result = await executeQuery(
      `INSERT INTO Tournaments
        (clan_id, tournament_name, tournament_type, format, status, start_date, teams_per_group, is_hosted, max_participants, registration_mode, created_by)
       VALUES (?, ?, ?, ?, 'open', NOW(), ?, 1, ?, ?, ?)`,
      [clanId, tournament_name, tournament_type, format, teams_per_group ?? 4, max_participants || 0, registration_mode || "players", uid]
    ) as ResultSetHeader;

    return NextResponse.json({ success: true, tournament_id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error("Error hosting tournament:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to host tournament" },
      { status: 500 }
    );
  }
}
