import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin, isClanMember } from "@/lib/authz";

// GET /api/organisations/sessions?batchId=
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    if (!batchId) return NextResponse.json({ error: "batchId required" }, { status: 400 });
    if (!(await isClanMember(uid, batchId)) && !(await isClanAdmin(uid, batchId))) return forbidden();

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
    const { batchId, title, scheduledAt, durationMinutes, notes } = await req.json();
    if (!batchId || !scheduledAt) return NextResponse.json({ error: "batchId and scheduledAt required" }, { status: 400 });
    if (!(await isClanAdmin(uid, batchId))) return forbidden("Only coaches can schedule sessions");

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
    const [row] = await executeQuery(`SELECT batch_id FROM TrainingSessions WHERE session_id = ?`, [sessionId]) as { batch_id: number }[];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isClanAdmin(uid, row.batch_id))) return forbidden("Only coaches can cancel sessions");

    await executeQuery(`DELETE FROM TrainingSessions WHERE session_id = ?`, [sessionId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
