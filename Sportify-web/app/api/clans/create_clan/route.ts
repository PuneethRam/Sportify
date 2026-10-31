import { NextResponse } from "next/server";
import { ResultSetHeader } from 'mysql2/promise';
import { createConnection } from '@/lib/db'; // Import the createConnection function
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// POST: Create a new clan
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { name } = await req.json();
    console.log(name, uid);

    if (!name) {
      return NextResponse.json({ error: "Clan name is required" }, { status: 400 });
    }

    // Start transaction for data consistency
    await connection.beginTransaction();

    try {
      // Insert the new clan
      const [clanResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO Clans (name, clan_rank) VALUES (?, ?);",
        [name, 0]
      );

      const clanId = clanResult.insertId;

      // Insert user as Admin of the clan
      await connection.execute(
        "INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Admin');",
        [uid, clanId]
      );

      await connection.execute(
        `INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`,
        [clanId, uid]
      );

      // Commit transaction
      await connection.commit();

      return NextResponse.json({ message: "Clan created successfully", clanId }, { status: 201 });
      
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