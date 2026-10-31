import { NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2/promise";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { orgId, name } = await req.json();

    if (!orgId || !name) {
      return NextResponse.json({ error: "Organisation ID and batch name are required" }, { status: 400 });
    }

    // Verify the user owns this organisation
    const [orgRows] = await connection.execute(
      "SELECT org_id FROM Organisations WHERE org_id = ? AND owner_user_id = ?",
      [orgId, uid]
    );

    if (!Array.isArray(orgRows) || orgRows.length === 0) {
      return NextResponse.json({ error: "Not authorised to create batches in this organisation" }, { status: 403 });
    }

    // Generate a unique invite code
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

    await connection.beginTransaction();

    try {
      // Create the batch (a clan with type='batch' linked to the org)
      const [clanResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO Clans (name, clan_rank, org_id, type, invite_code) VALUES (?, 0, ?, 'batch', ?)",
        [name, orgId, inviteCode]
      );

      const batchId = clanResult.insertId;

      // Add creator as Coach
      await connection.execute(
        "INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Coach')",
        [uid, batchId]
      );

      // Add to leaderboard
      await connection.execute(
        "INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)",
        [batchId, uid]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: "Batch created successfully",
        batchId,
        inviteCode
      }, { status: 201 });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
