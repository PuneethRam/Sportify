import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function DELETE(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get("seriesId");
    const clanId   = searchParams.get("clanId");

    if (!seriesId || !clanId) {
      return NextResponse.json({ success: false, error: "Missing seriesId or clanId" }, { status: 400 });
    }

    // Remove match records tied to this series
    await executeQuery(
      `DELETE FROM InternalSinglesMatches WHERE series_id = ? AND clan_id = ?`,
      [seriesId, clanId]
    );
    await executeQuery(
      `DELETE FROM InternalDoublesMatches WHERE series_id = ? AND clan_id = ?`,
      [seriesId, clanId]
    );

    const result = await executeQuery(
      `DELETE FROM InternalSeries WHERE series_id = ? AND clan_id = ?`,
      [seriesId, clanId]
    ) as ResultSetHeader;

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, error: "Series not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting series:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete series" },
      { status: 500 }
    );
  }
}
