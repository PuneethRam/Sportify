import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS TrainingSessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT 'Training Session',
    scheduled_at DATETIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

// GET /api/organisations/sessions?batchId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    await executeQuery(ENSURE_TABLE);
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    if (!batchId) return NextResponse.json({ error: "batchId required" }, { status: 400 });

    const rows = await executeQuery(
      `SELECT * FROM TrainingSessions WHERE batch_id = ? ORDER BY scheduled_at ASC`,
      [batchId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/organisations/sessions
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    await executeQuery(ENSURE_TABLE);
    const { batchId, title, scheduledAt, durationMinutes, notes } = await req.json();
    if (!batchId || !scheduledAt) return NextResponse.json({ error: "batchId and scheduledAt required" }, { status: 400 });

    const result = await executeQuery(
      `INSERT INTO TrainingSessions (batch_id, title, scheduled_at, duration_minutes, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [batchId, title || "Training Session", scheduledAt, durationMinutes || 60, notes || null, uid]
    ) as { insertId: number };

    return NextResponse.json({ success: true, sessionId: result.insertId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/organisations/sessions?sessionId=
export async function DELETE(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    await executeQuery(`DELETE FROM TrainingSessions WHERE session_id = ?`, [sessionId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
