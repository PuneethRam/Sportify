import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS OrgAnnouncements (
    announcement_id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT NOT NULL,
    author_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

// GET /api/organisations/org_announcements?orgId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    await executeQuery(ENSURE_TABLE);
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

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
    await executeQuery(ENSURE_TABLE);
    const { orgId, authorName, title, body, pinned } = await req.json();
    if (!orgId || !title || !body) {
      return NextResponse.json({ error: "orgId, title, body required" }, { status: 400 });
    }

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
    await executeQuery(ENSURE_TABLE);
    const { announcementId, pinned } = await req.json();
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });

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
    await executeQuery(ENSURE_TABLE);
    const { searchParams } = new URL(req.url);
    const announcementId = searchParams.get("announcementId");
    if (!announcementId) return NextResponse.json({ error: "announcementId required" }, { status: 400 });

    await executeQuery(`DELETE FROM OrgAnnouncements WHERE announcement_id = ?`, [announcementId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
