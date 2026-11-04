import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { notifySessionChanged } from "@/lib/sessionNotifications";

// GET /api/game-sessions/[id] — session detail + player list
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [session] = await executeQuery(
      `SELECT gs.*, COUNT(gsp.id) AS joined_count
       FROM GameSessions gs
       LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
       WHERE gs.session_id = ?
       GROUP BY gs.session_id`,
      [id]
    ) as Record<string, unknown>[];

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const players = await executeQuery(
      `SELECT user_id, user_name, joined_at FROM GameSessionPlayers WHERE session_id = ? ORDER BY joined_at ASC`,
      [id]
    );

    return NextResponse.json({ success: true, session, players });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// PATCH /api/game-sessions/[id] — cancel session (host only, verified via token)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    const { status } = await req.json();
    if (!["open", "full", "completed", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const res = await executeQuery(
      `UPDATE GameSessions SET status = ? WHERE session_id = ? AND host_user_id = ?`,
      [status, id, uid]
    ) as { changedRows: number };
    // Marking it completed after play needs no push
    if (res.changedRows > 0 && status !== "completed") {
      await notifySessionChanged(Number(id), uid, status);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
