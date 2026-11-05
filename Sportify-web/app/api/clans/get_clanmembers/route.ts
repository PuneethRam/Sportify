import { NextResponse } from "next/server";
import { RowDataPacket } from 'mysql2';
import { executeQuery } from '@/lib/db'; // Import the executeQuery helper
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const searchParams = new URL(req.url).searchParams;
  const clanId = searchParams.get('clanId');
  
  if (!clanId) {
    return NextResponse.json(
      { error: "Clan ID is required" },
      { status: 400 }
    );
  }

  try {
    // Join ClanMembers and Users tables to get member information
    const members = await executeQuery(
      `SELECT u.user_id, u.name, u.email, cm.role, cm.join_date
       FROM ClanMembers cm
       JOIN Users u ON cm.user_id = u.user_id
       WHERE cm.clan_id = ?
       ORDER BY u.name ASC`,
      [clanId]
    ) as RowDataPacket[];
    
    return NextResponse.json({
      success: true,
      members: members
    }, { status: 200 });
    
  } catch (error) {
    console.error("❌ Error fetching clan members:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}