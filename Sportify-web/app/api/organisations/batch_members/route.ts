import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin, isClanMember } from "@/lib/authz";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
    }
    if (!(await isClanMember(uid, batchId)) && !(await isClanAdmin(uid, batchId))) return forbidden();

    const rows = await executeQuery(
      `SELECT
        u.user_id,
        u.name,
        u.email,
        cm.role,
        cl.clan_points,
        cl.matchesplayed,
        cl.matcheswon,
        cl.matcheslost
       FROM ClanMembers cm
       JOIN Users u ON cm.user_id = u.user_id
       LEFT JOIN ClanLeaderboard cl ON cl.clan_id = cm.clan_id AND cl.user_id = cm.user_id
       WHERE cm.clan_id = ?
       ORDER BY cl.clan_points DESC`,
      [batchId]
    );

    return NextResponse.json({ success: true, data: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
