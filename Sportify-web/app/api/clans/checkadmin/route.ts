// app/api/clans/checkadmin/route.ts

import { NextResponse } from "next/server";
import { RowDataPacket } from 'mysql2';
import { executeQuery } from '@/lib/db'; // Import the executeQuery helper
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("clanId");

    if (!clanId) {
      return NextResponse.json({
        success: false,
        error: "Clan ID is required"
      }, { status: 400 });
    }

    // Check if the user is an admin in the clan
    const rows = await executeQuery(`
        SELECT role
        FROM ClanMembers
        WHERE user_id = ? AND clan_id = ?
    `, [uid, clanId]) as RowDataPacket[];

    const members = rows;
    const isAdmin = members.length > 0 && ['Admin', 'Coach', 'Owner'].includes(members[0]?.role);

    return NextResponse.json({ 
      success: true,
      isAdmin 
    }, { status: 200 });
    
  } catch (error) {
    console.error("❌ MySQL Fetch Error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}