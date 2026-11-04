import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { joinClan, JoinError } from "@/lib/membership";

// POST: Join a clan
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { clanId } = await req.json();
    if (!clanId) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }

    await joinClan(uid, clanId);
    return NextResponse.json({ message: "Joined clan successfully" }, { status: 201 });
  } catch (error) {
    if (error instanceof JoinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ MySQL Insert Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
