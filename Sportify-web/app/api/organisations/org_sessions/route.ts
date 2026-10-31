import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS OrgTrainingSessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    org_id INT NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT 'Training Session',
    scheduled_at DATETIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

// GET /api/organisations/org_sessions?orgId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    await executeQuery(ENSURE_TABLE);
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

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
    await executeQuery(ENSURE_TABLE);
    const { orgId, title, scheduledAt, durationMinutes, notes } = await req.json();
    if (!orgId || !scheduledAt) {
      return NextResponse.json({ error: "orgId and scheduledAt required" }, { status: 400 });
    }

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
    await executeQuery(ENSURE_TABLE);
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    await executeQuery(`DELETE FROM OrgTrainingSessions WHERE session_id = ?`, [sessionId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
