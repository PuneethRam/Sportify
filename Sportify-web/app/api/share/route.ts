import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { createShareCard, shareUrl } from "@/lib/shareCards";

// POST /api/share
//   { kind: "match", source: "clan_singles" | "clan_doubles" | "tournament", matchId }
//   { kind: "profile", clanId? }   (always the signed-in user's own profile)
// Returns a public link (/s/<token>) to send through the share sheet. The
// page's Open Graph image is the rank card.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  try {
    const result = await createShareCard(uid, await req.json().catch(() => null));
    if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({
      success: true,
      token: result.token,
      url: shareUrl(result.token),
      imageUrl: `${shareUrl(result.token).replace(/\/s\//, "/api/og/")}`,
    });
  } catch (error) {
    console.error("Error creating share card:", error);
    return NextResponse.json({ success: false, error: "Failed to create share link" }, { status: 500 });
  }
}
