import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// POST /api/game-sessions/[id]/kick — host removes a player
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    const { targetUserId } = await req.json();
    if (!targetUserId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Verify caller is the host
    const [session] = await executeQuery(
      `SELECT host_user_id FROM GameSessions WHERE session_id = ?`,
      [id]
    ) as { host_user_id: string }[];
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.host_user_id !== uid) return NextResponse.json({ error: "Not the host" }, { status: 403 });
    if (targetUserId === uid) return NextResponse.json({ error: "Host cannot remove themselves" }, { status: 400 });

    await executeQuery(`DELETE FROM GameSessionPlayers WHERE session_id = ? AND user_id = ?`, [id, targetUserId]);
    await executeQuery(`UPDATE GameSessions SET status = 'open' WHERE session_id = ? AND status = 'full'`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
