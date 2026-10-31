import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin, isClanMember } from "@/lib/authz";

// GET /api/organisations/announcements?batchId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    if (!batchId) return NextResponse.json({ error: "batchId required" }, { status: 400 });
    if (!(await isClanMember(uid, batchId)) && !(await isClanAdmin(uid, batchId))) return forbidden();

    const rows = await executeQuery(
      `SELECT * FROM BatchAnnouncements WHERE batch_id = ?
       ORDER BY pinned DESC, created_at DESC`,
      [batchId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/organisations/announcements
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { batchId, authorName, title, body, pinned } = await req.json();
    if (!batchId || !title || !body) {
      return NextResponse.json({ error: "batchId, title, body required" }, { status: 400 });
    }
    if (!(await isClanAdmin(uid, batchId))) return forbidden("Only coaches can post announcements");

    const result = await executeQuery(
      `INSERT INTO BatchAnnouncements (batch_id, author_id, author_name, title, body, pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [batchId, uid, authorName || null, title, body, pinned ? 1 : 0]
    ) as { insertId: number };

    return NextResponse.json({ success: true, announcementId: result.insertId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// PATCH /api/organisations/announcements — toggle pin
export async function PATCH(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { announcementId, pinned } = await req.json();
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });
    const [row] = await executeQuery(`SELECT batch_id FROM BatchAnnouncements WHERE announcement_id = ?`, [announcementId]) as { batch_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isClanAdmin(uid, row.batch_id))) return forbidden("Only coaches can manage announcements");

    await executeQuery(
      `UPDATE BatchAnnouncements SET pinned = ? WHERE announcement_id = ?`,
      [pinned ? 1 : 0, announcementId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/organisations/announcements?announcementId=
export async function DELETE(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const announcementId = searchParams.get("announcementId");
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });
    const [row] = await executeQuery(`SELECT batch_id FROM BatchAnnouncements WHERE announcement_id = ?`, [announcementId]) as { batch_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isClanAdmin(uid, row.batch_id))) return forbidden("Only coaches can manage announcements");

    await executeQuery(`DELETE FROM BatchAnnouncements WHERE announcement_id = ?`, [announcementId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
