import { NextResponse } from "next/server";
import { RowDataPacket } from 'mysql2';
import { createConnection } from '@/lib/db'; // Import the connection creator
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { clanId } = await req.json();

    if (!clanId) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }

    const connection = await createConnection();

    try {
      // Check if user is actually in the clan
      const [memberCheck] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM ClanMembers WHERE user_id = ? AND clan_id = ?;",
        [uid, clanId]
      );

      if (memberCheck.length === 0) {
        return NextResponse.json({ error: "User is not a member of this clan" }, { status: 400 });
      }

      // Check if user is the owner of the clan
      const [ownerCheck] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM ClanMembers WHERE user_id = ? AND clan_id = ? AND role = 'Admin';",
        [uid, clanId]
      );

      if (ownerCheck.length > 0) {
        return NextResponse.json(
          { error: "Clan owner cannot leave. Transfer ownership first." },
          { status: 400 }
        );
      }

      // Remove the user from the clan
      await connection.execute(
        "DELETE FROM ClanMembers WHERE user_id = ? AND clan_id = ?;",
        [uid, clanId]
      );

      await connection.execute(
        "DELETE FROM clanleaderboard WHERE user_id = ? AND clan_id = ?;",
        [uid, clanId]
      );

      return NextResponse.json({ message: "Left clan successfully" }, { status: 200 });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error("❌ MySQL Delete Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}