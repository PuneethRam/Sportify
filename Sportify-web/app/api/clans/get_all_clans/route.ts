import { NextResponse } from "next/server";
import { executeQuery } from '@/lib/db'; // Import the executeQuery helper
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    // Query to fetch all clans
    const rows = await executeQuery(
      `SELECT clan_id, name, clan_rank FROM Clans WHERE (type IS NULL OR type = 'group') ORDER BY clan_rank ASC;`
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