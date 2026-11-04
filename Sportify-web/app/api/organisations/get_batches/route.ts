import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isOrgMember } from "@/lib/authz";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "Organisation ID is required" }, { status: 400 });
    }
    if (!(await isOrgMember(uid, orgId))) return forbidden();

    const rows = await executeQuery(
      `SELECT
        c.clan_id, c.name, c.invite_code,
        COUNT(cm.user_id) as member_count
       FROM Clans c
       LEFT JOIN ClanMembers cm ON c.clan_id = cm.clan_id
       WHERE c.org_id = ? AND c.type = 'batch'
       GROUP BY c.clan_id, c.name, c.invite_code
       ORDER BY c.clan_id ASC`,
      [orgId]
    );

    return NextResponse.json({ success: true, data: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
