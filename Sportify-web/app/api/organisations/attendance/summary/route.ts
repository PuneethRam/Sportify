import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin } from "@/lib/authz";

// GET /api/organisations/attendance/summary?batchId=
// Returns per-student attendance stats: total sessions, present count, rate
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json({ error: "batchId is required" }, { status: 400 });
    }
    if (!(await isClanAdmin(uid, batchId))) return forbidden();

    // Total unique sessions for this batch
    const [sessionRow] = await executeQuery(
      `SELECT COUNT(DISTINCT session_date) AS total_sessions FROM Attendance WHERE batch_id = ?`,
      [batchId]
    ) as { total_sessions: number }[];

    const totalSessions = Number(sessionRow?.total_sessions ?? 0);

    // Per-student present + late counts
    const rows = await executeQuery(
      `SELECT
         a.user_id,
         u.name,
         SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_count
       FROM Attendance a
       JOIN Users u ON a.user_id = u.user_id
       WHERE a.batch_id = ?
       GROUP BY a.user_id, u.name`,
      [batchId]
    );

    return NextResponse.json({ success: true, totalSessions, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
