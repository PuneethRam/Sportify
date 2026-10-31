import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET /api/game-sessions/[id]/messages?since=<message_id>
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since") ?? "0";

    const rows = await executeQuery(
      `SELECT message_id, user_id, user_name, message, sent_at
       FROM GameSessionMessages
       WHERE session_id = ? AND message_id > ?
       ORDER BY sent_at ASC
       LIMIT 100`,
      [id, since]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/game-sessions/[id]/messages
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { id } = await params;
    const { userName, message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Only participants can chat — check membership
    const [membership] = await executeQuery(
      `SELECT id FROM GameSessionPlayers WHERE session_id = ? AND user_id = ?`,
      [id, uid]
    ) as { id: number }[];
    if (!membership) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    const result = await executeQuery(
      `INSERT INTO GameSessionMessages (session_id, user_id, user_name, message) VALUES (?, ?, ?, ?)`,
      [id, uid, userName || null, message.trim()]
    ) as { insertId: number };

    return NextResponse.json({ success: true, messageId: result.insertId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
