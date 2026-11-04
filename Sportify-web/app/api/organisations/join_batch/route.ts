import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { joinBatchByCode, JoinError } from "@/lib/membership";

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { inviteCode } = await req.json();

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const batch = await joinBatchByCode(uid, inviteCode);
    return NextResponse.json({
      success: true,
      message: `Joined batch "${batch.batchName}" successfully`,
      batchId: batch.batchId,
      batchName: batch.batchName
    }, { status: 201 });
  } catch (error) {
    if (error instanceof JoinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
