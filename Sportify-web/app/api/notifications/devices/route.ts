import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// POST /api/notifications/devices  { token, platform: "android" | "ios" }
// Registers this device's FCM token for the signed-in user. A token moves to
// whoever signed in on the device most recently.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { token, platform } = await req.json();
  if (typeof token !== "string" || !token || token.length > 512) {
    return NextResponse.json({ success: false, error: "token is required" }, { status: 400 });
  }
  await executeQuery(
    `INSERT INTO DeviceTokens (token, user_id, platform) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), last_seen_at = NOW()`,
    [token, uid, ["android", "ios"].includes(platform) ? platform : null]
  );
  return NextResponse.json({ success: true });
}

// DELETE /api/notifications/devices  { token } — on sign-out. Only your own tokens.
export async function DELETE(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ success: false, error: "token is required" }, { status: 400 });
  }
  await executeQuery(`DELETE FROM DeviceTokens WHERE token = ? AND user_id = ?`, [token, uid]);
  return NextResponse.json({ success: true });
}
