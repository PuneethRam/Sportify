import { NextResponse } from "next/server";
import { executeQuery } from '@/lib/db'; // Import the executeQuery helper
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// GET: Fetch user's clans
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const rows = await executeQuery(
      `SELECT c.clan_id, c.name, c.clan_rank, c.type, c.org_id
       FROM Clans c
       JOIN ClanMembers cm ON c.clan_id = cm.clan_id
       WHERE cm.user_id = ?;`,
      [uid]
    );
    
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error("❌ MySQL Fetch Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}