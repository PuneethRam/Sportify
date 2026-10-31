import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("id");

    if (!clanId) {
      return NextResponse.json({ success: false, error: "Clan ID required" }, { status: 400 });
    }

    const rows = await executeQuery(
      `SELECT tournament_id, clan_id, tournament_name, tournament_type, format,
              start_date, end_date, status, winner_team_id
       FROM Tournaments WHERE clan_id = ? ORDER BY start_date DESC`,
      [clanId]
    ) as RowDataPacket[];

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching tournaments:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch tournaments" }, { status: 500 });
  }
}
