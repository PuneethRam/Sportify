import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isOrgMember, isOrgStaff } from "@/lib/authz";

// GET /api/organisations/org_sessions?orgId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    if (!(await isOrgMember(uid, orgId))) return forbidden();

    const rows = await executeQuery(
      `SELECT * FROM OrgTrainingSessions WHERE org_id = ? ORDER BY scheduled_at ASC`,
      [orgId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/organisations/org_sessions
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { orgId, title, scheduledAt, durationMinutes, notes } = await req.json();
    if (!orgId || !scheduledAt) {
      return NextResponse.json({ error: "orgId and scheduledAt required" }, { status: 400 });
    }
    if (!(await isOrgStaff(uid, orgId))) return forbidden("Only academy staff can schedule sessions");

    const result = await executeQuery(
      `INSERT INTO OrgTrainingSessions (org_id, title, scheduled_at, duration_minutes, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, title || "Training Session", scheduledAt, durationMinutes || 60, notes || null, uid]
    ) as { insertId: number };

    return NextResponse.json({ success: true, sessionId: result.insertId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/organisations/org_sessions?sessionId=
export async function DELETE(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    const [row] = await executeQuery(`SELECT org_id FROM OrgTrainingSessions WHERE session_id = ?`, [sessionId]) as { org_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isOrgStaff(uid, row.org_id))) return forbidden("Only academy staff can cancel sessions");

    await executeQuery(`DELETE FROM OrgTrainingSessions WHERE session_id = ?`, [sessionId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
