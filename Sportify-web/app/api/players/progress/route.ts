import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { loadProgress } from "@/lib/progress";

// GET /api/players/progress?userId=<uid>   (default: the signed-in user)
// Ratings (singles / doubles, with "provisional"), weekly streak, season
// badges and rank in each clan. Display data only, so any signed-in user can
// see another player's progress, like the leaderboard.
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  const userId = new URL(req.url).searchParams.get("userId") || uid;
  try {
    const progress = await loadProgress(userId);
    if (!progress) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true, ...progress });
  } catch (error) {
    console.error("Error loading progress:", error);
    return NextResponse.json({ success: false, error: "Failed to load progress" }, { status: 500 });
  }
}
