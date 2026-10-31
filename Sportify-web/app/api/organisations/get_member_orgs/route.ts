import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/organisations/get_member_orgs
// Returns orgs where user is a batch member but NOT the owner
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const rows = await executeQuery(
      `SELECT DISTINCT o.org_id, o.name, o.created_at, cm.role
       FROM Organisations o
       JOIN Clans c ON c.org_id = o.org_id AND c.type = 'batch'
       JOIN ClanMembers cm ON cm.clan_id = c.clan_id AND cm.user_id = ?
       WHERE o.owner_user_id != ?
       ORDER BY o.name`,
      [uid, uid]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
