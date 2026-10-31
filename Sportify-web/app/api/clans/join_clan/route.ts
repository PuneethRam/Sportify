import { NextResponse } from "next/server";
import { RowDataPacket } from 'mysql2';
import { createConnection } from '@/lib/db'; // Import the createConnection function
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// POST: Join a clan
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { clanId } = await req.json();

    if (!clanId) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }

    // Check if user is already a member
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM ClanMembers WHERE user_id = ? AND clan_id = ?;",
      [uid, clanId]
    );
    
    if (existing.length > 0) {
      return NextResponse.json({ error: "User is already in the clan" }, { status: 400 });
    }

    // Start transaction for data consistency
    await connection.beginTransaction();

    try {
      // Insert user into the clan
      await connection.execute(
        "INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Member');",
        [uid, clanId]
      );

      await connection.execute(
        `INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points,matchesplayed,matcheswon,matcheslost) VALUES (?, ?, 100,0,0,0)`,
        [clanId, uid]
      );

      // Commit transaction
      await connection.commit();

      return NextResponse.json({ message: "Joined clan successfully" }, { status: 201 });
      
    } catch (transactionError) {
      // Rollback transaction on error
      await connection.rollback();
      throw transactionError;
    }
    
  } catch (error) {
    console.error("❌ MySQL Insert Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    // Always close the connection
    await connection.end();
  }
}