import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { joinGameSession, JoinError } from "@/lib/membership";
import { notifySessionJoined } from "@/lib/sessionNotifications";

// POST /api/game-sessions/[id]/join
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    const { userName } = await req.json();

    try {
      await joinGameSession(uid, Number(id), userName || null);
    } catch (err) {
      // Joining twice has always been a no-op success
      if (err instanceof JoinError && err.alreadyMember) return NextResponse.json({ success: true });
      throw err;
    }
    await notifySessionJoined(Number(id), uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof JoinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
