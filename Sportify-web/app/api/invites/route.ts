import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden } from "@/lib/authz";
import { canManageInvites, inviteUrl, isInviteType, newToken } from "@/lib/invites";

// POST /api/invites
// Body: { type: "clan" | "batch" | "session", id, expiresInDays?, rotate? }
// Returns the target's current link, creating one if there isn't one.
// rotate: true revokes the current link(s) and issues a new one.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { type, id, expiresInDays, rotate } = await req.json();
  const targetId = Number(id);
  if (!isInviteType(type) || !Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ success: false, error: "type (clan | batch | session) and id are required" }, { status: 400 });
  }
  const days = expiresInDays == null ? null : Number(expiresInDays);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
    return NextResponse.json({ success: false, error: "expiresInDays must be 1–365" }, { status: 400 });
  }

  if (!(await canManageInvites(uid, type, targetId))) {
    return forbidden(type === "session" ? "Only the host can share an invite link" : "Only admins and coaches can share an invite link");
  }

  // The target must be the kind of thing the link says it is
  let inviteCode: string | null = null;
  if (type === "session") {
    const [s] = await executeQuery(`SELECT status FROM GameSessions WHERE session_id = ?`, [targetId]) as RowDataPacket[];
    if (!s) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    if (s.status === "cancelled" || s.status === "completed") {
      return NextResponse.json({ success: false, error: `This session is ${s.status}` }, { status: 400 });
    }
  } else {
    const [c] = await executeQuery(`SELECT type, invite_code FROM Clans WHERE clan_id = ?`, [targetId]) as RowDataPacket[];
    if (!c) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    if ((c.type === "batch") !== (type === "batch")) {
      return NextResponse.json({ success: false, error: `That is not a ${type}` }, { status: 400 });
    }
    if (type === "batch") {
      if (!c.invite_code) return NextResponse.json({ success: false, error: "Generate an invite code for this batch first" }, { status: 400 });
      inviteCode = c.invite_code;
    }
  }

  try {
    if (rotate) {
      await executeQuery(
        `UPDATE InviteLinks SET revoked_at = NOW(), revoked_by = ?
         WHERE target_type = ? AND target_id = ? AND revoked_at IS NULL`,
        [uid, type, targetId]
      );
    } else {
      const [existing] = await executeQuery(
        `SELECT token, expires_at FROM InviteLinks
         WHERE target_type = ? AND target_id = ? AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW()) AND invite_code <=> ?
         ORDER BY created_at DESC LIMIT 1`,
        [type, targetId, inviteCode]
      ) as RowDataPacket[];
      if (existing) {
        return NextResponse.json({ success: true, created: false, token: existing.token, url: inviteUrl(existing.token), expiresAt: existing.expires_at });
      }
    }

    const token = newToken();
    await executeQuery(
      `INSERT INTO InviteLinks (token, target_type, target_id, invite_code, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ${days ? "NOW() + INTERVAL ? DAY" : "NULL"})`,
      [token, type, targetId, inviteCode, uid, ...(days ? [days] : [])]
    );
    const [row] = await executeQuery(`SELECT expires_at FROM InviteLinks WHERE token = ?`, [token]) as RowDataPacket[];
    return NextResponse.json({ success: true, created: true, token, url: inviteUrl(token), expiresAt: row?.expires_at ?? null }, { status: 201 });
  } catch (error) {
    console.error("Error creating invite link:", error);
    return NextResponse.json({ success: false, error: "Failed to create invite link" }, { status: 500 });
  }
}
