import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// POST /api/game-sessions/[id]/join
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    const { userName } = await req.json();

    // Lock: fetch session + current count atomically
    const [session] = await executeQuery(
      `SELECT gs.session_id, gs.max_players, gs.status, COUNT(gsp.id) AS joined_count
       FROM GameSessions gs
       LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
       WHERE gs.session_id = ?
       GROUP BY gs.session_id`,
      [id]
    ) as { session_id: number; max_players: number; status: string; joined_count: number }[];

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.status === "cancelled") return NextResponse.json({ error: "Session cancelled" }, { status: 400 });
    if (session.status === "completed") return NextResponse.json({ error: "Session already completed" }, { status: 400 });
    if (Number(session.joined_count) >= session.max_players) {
      return NextResponse.json({ error: "Session is full" }, { status: 400 });
    }

    await executeQuery(
      `INSERT IGNORE INTO GameSessionPlayers (session_id, user_id, user_name) VALUES (?, ?, ?)`,
      [id, uid, userName || null]
    );

    // Update status to 'full' if now at capacity
    const [updated] = await executeQuery(
      `SELECT COUNT(*) AS cnt FROM GameSessionPlayers WHERE session_id = ?`,
      [id]
    ) as { cnt: number }[];
    if (Number(updated.cnt) >= session.max_players) {
      await executeQuery(`UPDATE GameSessions SET status = 'full' WHERE session_id = ?`, [id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/game-sessions/[id]/join — leave a session
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    await executeQuery(`DELETE FROM GameSessionPlayers WHERE session_id = ? AND user_id = ?`, [id, uid]);
    // Re-open if was full
    await executeQuery(
      `UPDATE GameSessions SET status = 'open' WHERE session_id = ? AND status = 'full'`,
      [id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
