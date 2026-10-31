import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/organisations/org_context?orgId=
// Returns org info + all batches + user's role in the org
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const orgId  = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const [org] = await executeQuery(
      `SELECT org_id, name, owner_user_id, created_at FROM Organisations WHERE org_id = ?`,
      [orgId]
    ) as { org_id: number; name: string; owner_user_id: string; created_at: string }[];

    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isOwner = org.owner_user_id === uid;

    const batches = await executeQuery(
      `SELECT c.clan_id, c.name, c.invite_code,
              COALESCE(m.cnt, 0) AS member_count
       FROM Clans c
       LEFT JOIN (
         SELECT clan_id, COUNT(*) AS cnt FROM ClanMembers GROUP BY clan_id
       ) m ON m.clan_id = c.clan_id
       WHERE c.org_id = ? AND c.type = 'batch'
       ORDER BY c.name`,
      [orgId]
    );

    const [membership] = await executeQuery(
      `SELECT c.clan_id, c.name AS batch_name, cm.role
       FROM ClanMembers cm
       JOIN Clans c ON c.clan_id = cm.clan_id
       WHERE c.org_id = ? AND c.type = 'batch' AND cm.user_id = ?
       LIMIT 1`,
      [orgId, uid]
    ) as { clan_id: number; batch_name: string; role: string }[];

    const isStaff = membership
      ? ["Coach", "Admin"].includes(membership.role)
      : false;

    return NextResponse.json({
      success: true,
      org,
      batches,
      isOwner,
      isStaff,
      userMembership: membership || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
