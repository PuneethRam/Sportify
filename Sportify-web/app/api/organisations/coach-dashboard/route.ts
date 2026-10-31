import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/organisations/coach-dashboard
// Returns everything needed for the coach dashboard in one round-trip
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    // 1. Academies owned by this user
    const orgs = await executeQuery(
      `SELECT org_id, name FROM Organisations WHERE owner_user_id = ? ORDER BY created_at DESC`,
      [uid]
    ) as { org_id: number; name: string }[];

    if (orgs.length === 0) {
      return NextResponse.json({ academies: [] });
    }

    const orgIds = orgs.map(o => o.org_id);
    const ph = orgIds.map(() => "?").join(",");

    // 2. All batches for these orgs with member counts
    const batches = await executeQuery(
      `SELECT c.clan_id, c.name, c.org_id,
         COUNT(cm.user_id) as member_count
       FROM Clans c
       LEFT JOIN ClanMembers cm ON c.clan_id = cm.clan_id
       WHERE c.org_id IN (${ph}) AND c.type = 'batch'
       GROUP BY c.clan_id, c.name, c.org_id
       ORDER BY c.clan_id ASC`,
      orgIds
    ) as { clan_id: number; name: string; org_id: number; member_count: number }[];

    const batchIds = batches.map(b => b.clan_id);

    // 3. Attendance summary per batch (rate and at-risk count)
    let batchAttendance: {
      batch_id: number; attendance_rate: number; at_risk_count: number; total_sessions: number;
    }[] = [];

    if (batchIds.length > 0) {
      const bph = batchIds.map(() => "?").join(",");

      const attRows = await executeQuery(
        `SELECT
           a.batch_id,
           COUNT(DISTINCT a.session_date) AS total_sessions,
           ROUND(
             100 * SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0)
           , 0) AS attendance_rate
         FROM Attendance a
         WHERE a.batch_id IN (${bph})
         GROUP BY a.batch_id`,
        batchIds
      ) as { batch_id: number; total_sessions: number; attendance_rate: number }[];

      // At-risk students per batch (attendance < 60%)
      const atRiskRows = await executeQuery(
        `SELECT a.batch_id, COUNT(DISTINCT a.user_id) AS at_risk_count
         FROM (
           SELECT a.batch_id, a.user_id,
             ROUND(100 * SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0), 0) AS rate
           FROM Attendance a
           WHERE a.batch_id IN (${bph})
           GROUP BY a.batch_id, a.user_id
         ) sub
         WHERE sub.rate < 60
         GROUP BY sub.batch_id`,
        batchIds
      ) as { batch_id: number; at_risk_count: number }[];

      const attMap = Object.fromEntries(attRows.map(r => [r.batch_id, r]));
      const riskMap = Object.fromEntries(atRiskRows.map(r => [r.batch_id, r.at_risk_count]));
      batchAttendance = batchIds.map(id => ({
        batch_id: id,
        total_sessions: Number(attMap[id]?.total_sessions ?? 0),
        attendance_rate: Number(attMap[id]?.attendance_rate ?? 0),
        at_risk_count:   Number(riskMap[id] ?? 0),
      }));
    }

    // 4. At-risk student details (for the alert panel)
    let atRiskStudents: { user_id: string; name: string; batch_id: number; batch_name: string; rate: number }[] = [];
    if (batchIds.length > 0) {
      const bph = batchIds.map(() => "?").join(",");
      atRiskStudents = await executeQuery(
        `SELECT sub.user_id, u.name, sub.batch_id, c.name AS batch_name,
           sub.rate
         FROM (
           SELECT a.user_id, a.batch_id,
             ROUND(100 * SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0), 0) AS rate
           FROM Attendance a
           WHERE a.batch_id IN (${bph})
           GROUP BY a.user_id, a.batch_id
           HAVING rate < 60
         ) sub
         JOIN Users u ON u.user_id = sub.user_id
         JOIN Clans c ON c.clan_id = sub.batch_id
         ORDER BY sub.rate ASC
         LIMIT 10`,
        batchIds
      ) as { user_id: string; name: string; batch_id: number; batch_name: string; rate: number }[];
    }

    // 5. Upcoming sessions across all orgs (next 7 days)
    const upcomingSessions = await executeQuery(
      `SELECT s.session_id, s.org_id, s.title, s.scheduled_at,
         s.duration_minutes, o.name AS org_name
       FROM OrgTrainingSessions s
       JOIN Organisations o ON o.org_id = s.org_id
       WHERE s.org_id IN (${ph})
         AND s.scheduled_at >= NOW()
         AND s.scheduled_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)
       ORDER BY s.scheduled_at ASC
       LIMIT 6`,
      orgIds
    ) as { session_id: number; org_id: number; title: string; scheduled_at: string; duration_minutes: number; org_name: string }[];

    // 6. Assemble
    const attIndex  = Object.fromEntries(batchAttendance.map(b => [b.batch_id, b]));
    const academies = orgs.map(org => {
      const orgBatches = batches
        .filter(b => b.org_id === org.org_id)
        .map(b => ({
          ...b,
          ...(attIndex[b.clan_id] ?? { total_sessions: 0, attendance_rate: 0, at_risk_count: 0 }),
        }));
      return {
        ...org,
        batches: orgBatches,
        total_students: orgBatches.reduce((s, b) => s + Number(b.member_count), 0),
        avg_attendance: orgBatches.length
          ? Math.round(orgBatches.reduce((s, b) => s + Number(attIndex[b.clan_id]?.attendance_rate ?? 0), 0) / orgBatches.length)
          : 0,
        upcoming_sessions: upcomingSessions.filter(s => s.org_id === org.org_id),
      };
    });

    return NextResponse.json({ academies, atRiskStudents });
  } catch (error) {
    console.error("coach-dashboard error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
