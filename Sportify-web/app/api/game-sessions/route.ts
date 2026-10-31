import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/game-sessions — list upcoming/open sessions with player count
export async function GET() {
  try {
    const rows = await executeQuery(
      `SELECT
         gs.*,
         COUNT(gsp.id) AS joined_count
       FROM GameSessions gs
       LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
       WHERE gs.status IN ('open', 'full') AND gs.scheduled_at >= NOW() - INTERVAL 2 HOUR
       GROUP BY gs.session_id
       ORDER BY gs.scheduled_at ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/game-sessions — create a session (host is auto-added as first player)
export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { hostName, title, sport, location, scheduledAt, maxPlayers, description, skillLevel } = await req.json();
    if (!title || !location || !scheduledAt || !maxPlayers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const validSkill = ["any","beginner","intermediate","advanced"];
    const skill = validSkill.includes(skillLevel) ? skillLevel : "any";
    const result = await executeQuery(
      `INSERT INTO GameSessions (host_user_id, host_name, title, sport, location, scheduled_at, max_players, description, skill_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, hostName || null, title, sport || null, location, scheduledAt, maxPlayers, description || null, skill]
    ) as { insertId: number };
    const sessionId = result.insertId;
    // Host auto-joins as first player
    await executeQuery(
      `INSERT INTO GameSessionPlayers (session_id, user_id, user_name) VALUES (?, ?, ?)`,
      [sessionId, uid, hostName || null]
    );
    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
