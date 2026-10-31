import { NextResponse } from "next/server";
import { executeQuery } from '@/lib/db'; // Import the executeQuery helper
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    console.log(id);

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const rows = await executeQuery(
      `SELECT clan_id, name, clan_rank, type, org_id FROM Clans WHERE clan_id = ?;`,
      [id]
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