import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { inviteCode } = await req.json();

    if (!inviteCode) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    // Find the batch by invite code
    const [batchRows] = await connection.execute(
      "SELECT clan_id, name FROM Clans WHERE invite_code = ? AND type = 'batch'",
      [inviteCode.toUpperCase().trim()]
    );

    if (!Array.isArray(batchRows) || batchRows.length === 0) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
    }

    const batch = batchRows[0] as { clan_id: number; name: string };

    // Check if already a member
    const [existing] = await connection.execute(
      "SELECT user_id FROM ClanMembers WHERE clan_id = ? AND user_id = ?",
      [batch.clan_id, uid]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ error: "You are already in this batch" }, { status: 400 });
    }

    await connection.beginTransaction();

    try {
      await connection.execute(
        "INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Member')",
        [uid, batch.clan_id]
      );

      await connection.execute(
        "INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points, matchesplayed, matcheswon, matcheslost) VALUES (?, ?, 0, 0, 0, 0)",
        [batch.clan_id, uid]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: `Joined batch "${batch.name}" successfully`,
        batchId: batch.clan_id,
        batchName: batch.name
      }, { status: 201 });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
