import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isOrgMember, isOrgStaff } from "@/lib/authz";

// GET /api/organisations/org_announcements?orgId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    if (!(await isOrgMember(uid, orgId))) return forbidden();

    const rows = await executeQuery(
      `SELECT * FROM OrgAnnouncements WHERE org_id = ?
       ORDER BY pinned DESC, created_at DESC`,
      [orgId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/organisations/org_announcements
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { orgId, authorName, title, body, pinned } = await req.json();
    if (!orgId || !title || !body) {
      return NextResponse.json({ error: "orgId, title, body required" }, { status: 400 });
    }
    if (!(await isOrgStaff(uid, orgId))) return forbidden("Only academy staff can post announcements");

    const result = await executeQuery(
      `INSERT INTO OrgAnnouncements (org_id, author_id, author_name, title, body, pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, uid, authorName || null, title, body, pinned ? 1 : 0]
    ) as { insertId: number };

    return NextResponse.json({ success: true, announcementId: result.insertId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// PATCH /api/organisations/org_announcements — toggle pin
export async function PATCH(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { announcementId, pinned } = await req.json();
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });
    const [row] = await executeQuery(`SELECT org_id FROM OrgAnnouncements WHERE announcement_id = ?`, [announcementId]) as { org_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isOrgStaff(uid, row.org_id))) return forbidden("Only academy staff can manage announcements");

    await executeQuery(
      `UPDATE OrgAnnouncements SET pinned = ? WHERE announcement_id = ?`,
      [pinned ? 1 : 0, announcementId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/organisations/org_announcements?announcementId=
export async function DELETE(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const announcementId = searchParams.get("announcementId");
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });
    const [row] = await executeQuery(`SELECT org_id FROM OrgAnnouncements WHERE announcement_id = ?`, [announcementId]) as { org_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isOrgStaff(uid, row.org_id))) return forbidden("Only academy staff can manage announcements");

    await executeQuery(`DELETE FROM OrgAnnouncements WHERE announcement_id = ?`, [announcementId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
