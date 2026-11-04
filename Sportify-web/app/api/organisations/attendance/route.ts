import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { areClanMembers, forbidden, isClanAdmin } from "@/lib/authz";

// GET /api/organisations/attendance?batchId=&date=YYYY-MM-DD
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const date = searchParams.get("date");

    if (!batchId || !date) {
      return NextResponse.json({ error: "batchId and date are required" }, { status: 400 });
    }
    if (!(await isClanAdmin(uid, batchId))) return forbidden("Only coaches can view attendance for a batch");

    const rows = await executeQuery(
      `SELECT a.user_id, a.status, u.name
       FROM Attendance a
       JOIN Users u ON a.user_id = u.user_id
       WHERE a.batch_id = ? AND a.session_date = ?`,
      [batchId, date]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/organisations/attendance
// Body: { batchId, date, sessionName, records: [{ userId, status }] }
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { batchId, date, sessionName, records } = await req.json();

    if (!batchId || !date || !Array.isArray(records)) {
      return NextResponse.json({ error: "batchId, date, and records are required" }, { status: 400 });
    }
    if (!(await isClanAdmin(uid, batchId))) return forbidden("Only coaches can mark attendance");
    if (records.some((r: { status?: string }) => !["present", "absent", "late"].includes(r?.status ?? ""))) {
      return NextResponse.json({ error: "Each record needs a status of present, absent or late" }, { status: 400 });
    }
    if (records.length && !(await areClanMembers(batchId, records.map((r: { userId: string }) => r.userId)))) {
      return NextResponse.json({ error: "All students must be members of this batch" }, { status: 400 });
    }

    for (const r of records) {
      await executeQuery(
        `INSERT INTO Attendance (batch_id, session_date, session_name, user_id, status, marked_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), session_name = VALUES(session_name), marked_by = VALUES(marked_by), updated_at = NOW()`,
        [batchId, date, sessionName || null, r.userId, r.status, uid]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
