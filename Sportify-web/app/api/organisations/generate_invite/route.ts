import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin } from "@/lib/authz";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST — regenerate invite code for a batch (coach only)
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { batchId } = await req.json();

    if (!batchId) {
      return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
    }

    // Verify user is Coach or org Owner of this batch
    if (!(await isClanAdmin(uid, batchId))) return forbidden("Only coaches can regenerate invite codes");

    // Generate unique code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    while (!isUnique) {
      const [existing] = await connection.execute(
        "SELECT clan_id FROM Clans WHERE invite_code = ?",
        [inviteCode]
      );
      if (Array.isArray(existing) && existing.length === 0) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
      }
    }

    await connection.execute(
      "UPDATE Clans SET invite_code = ? WHERE clan_id = ?",
      [inviteCode, batchId]
    );

    return NextResponse.json({ success: true, inviteCode }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
