import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden } from "@/lib/authz";
import { canManageInvites, describeTarget, getInvite, inviteStatus, isAlreadyIn } from "@/lib/invites";

type Ctx = { params: Promise<{ token: string }> };

// GET /api/invites/[token] — what the link is for, so the landing page can
// show it before sign-in. Signed-in callers also get alreadyMember.
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const link = await getInvite(token);
  const target = link && await describeTarget(link.target_type, link.target_id);
  if (!link || !target) return NextResponse.json({ success: false, error: "This invite link doesn't exist" }, { status: 404 });

  const uid = await getUserFromRequest(req);
  const [inviter] = await executeQuery(`SELECT name FROM Users WHERE user_id = ?`, [link.created_by]) as RowDataPacket[];
  return NextResponse.json({
    success: true,
    type: link.target_type,
    status: await inviteStatus(link),
    expiresAt: link.expires_at,
    invitedBy: inviter?.name ?? null,
    target,
    alreadyMember: uid ? await isAlreadyIn(uid, link.target_type, link.target_id) : null,
  });
}

// DELETE /api/invites/[token] — revoke the link
export async function DELETE(req: Request, { params }: Ctx) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { token } = await params;
  const link = await getInvite(token);
  if (!link) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (!(await canManageInvites(uid, link.target_type, link.target_id))) return forbidden();

  await executeQuery(
    `UPDATE InviteLinks SET revoked_at = NOW(), revoked_by = ? WHERE token = ? AND revoked_at IS NULL`,
    [uid, token]
  );
  return NextResponse.json({ success: true });
}
