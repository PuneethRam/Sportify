import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { executeQuery } from "@/lib/db";
import { describeTarget, destination, getInvite, inviteStatus } from "@/lib/invites";
import { joinBatchByCode, joinClan, JoinError, joinGameSession } from "@/lib/membership";
import { displayName, notify } from "@/lib/notify";
import { notifySessionJoined } from "@/lib/sessionNotifications";

// POST /api/invites/[token]/accept — join what the link points at, with the
// same rules as the normal join routes. Already being a member is a success
// (alreadyMember: true) so tapping a link twice just takes you there.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { token } = await params;
  const link = await getInvite(token);
  if (!link) return NextResponse.json({ success: false, error: "This invite link doesn't exist" }, { status: 404 });
  const status = await inviteStatus(link);
  if (status !== "active") {
    return NextResponse.json({ success: false, error: `This invite link has ${status === "expired" ? "expired" : "been turned off"}`, status }, { status: 410 });
  }

  let alreadyMember = false;
  try {
    if (link.target_type === "clan") await joinClan(uid, link.target_id);
    else if (link.target_type === "batch") await joinBatchByCode(uid, link.invite_code!);
    else {
      const body = await req.json().catch(() => ({}));
      await joinGameSession(uid, link.target_id, typeof body?.userName === "string" ? body.userName : null);
    }
  } catch (err) {
    if (!(err instanceof JoinError)) {
      console.error("Error accepting invite:", err);
      return NextResponse.json({ success: false, error: "Failed to join" }, { status: 500 });
    }
    if (!err.alreadyMember) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    alreadyMember = true;
  }

  if (!alreadyMember) {
    await executeQuery(`INSERT IGNORE INTO InviteAcceptances (token, user_id) VALUES (?, ?)`, [token, uid]);
    await executeQuery(`UPDATE InviteLinks SET use_count = use_count + 1 WHERE token = ?`, [token]);
    const target = await describeTarget(link.target_type, link.target_id);
    if (link.target_type === "session") await notifySessionJoined(link.target_id, uid);
    // Session hosts already hear about every join; for clans and batches tell whoever shared the link
    if (link.target_type !== "session" && link.created_by !== uid) {
      await notify(link.created_by, "invite_accepted", {
        title: "Your invite was accepted",
        body: `${await displayName(uid)} joined ${target?.name ?? `your ${link.target_type}`}`,
        route: (await destination(link.target_type, link.target_id)).appRoute,
      });
    }
  }

  return NextResponse.json({
    success: true,
    type: link.target_type,
    alreadyMember,
    ...(await destination(link.target_type, link.target_id)),
  });
}
