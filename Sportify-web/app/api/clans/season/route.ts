import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanMember, isClanAdmin } from "@/lib/authz";
import { loadRatings } from "@/lib/ratings";
import { BADGE_LABELS, Badge, closeSeason, isSeason, seasonName, seasonOf, seasonStandings } from "@/lib/seasons";

// GET /api/clans/season?clanId=<id>&season=YYYY-MM   (default: this month, India time)
// The clan's / batch's season standing, plus badges once the season is over.
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  const { searchParams } = new URL(req.url);
  const clanId = searchParams.get("clanId");
  const season = searchParams.get("season") || seasonOf(new Date());
  if (!clanId || !isSeason(season)) {
    return NextResponse.json({ success: false, error: "clanId and a season (YYYY-MM) are required" }, { status: 400 });
  }
  if (!(await isClanMember(uid, clanId)) && !(await isClanAdmin(uid, clanId))) {
    return forbidden("Only members can see this season");
  }

  try {
    const current = seasonOf(new Date());
    if (season < current) await closeSeason(Number(clanId), season);

    const standings = await seasonStandings(clanId, season);
    const uids = standings.map(s => s.userId);
    const names = uids.length
      ? await executeQuery(`SELECT user_id, name FROM Users WHERE user_id IN (${uids.map(() => "?").join(",")})`, uids) as RowDataPacket[]
      : [];
    const name = new Map(names.map(n => [n.user_id as string, n.name as string]));
    const ratings = await loadRatings(uids);
    const badges = await executeQuery(
      `SELECT user_id, badge, rank_pos, value FROM SeasonBadges WHERE clan_id = ? AND season = ?`,
      [clanId, season]
    ) as RowDataPacket[];

    return NextResponse.json({
      success: true,
      season,
      seasonName: seasonName(season),
      current: season === current,
      standings: standings.map(s => ({
        ...s,
        name: name.get(s.userId) ?? "Player",
        ratings: ratings.get(s.userId),
      })),
      badges: badges.map(b => ({
        userId: b.user_id, name: name.get(b.user_id) ?? "Player",
        badge: b.badge as Badge, label: BADGE_LABELS[b.badge as Badge], rank: b.rank_pos, value: b.value,
      })),
    });
  } catch (error) {
    console.error("Error loading season:", error);
    return NextResponse.json({ success: false, error: "Failed to load season" }, { status: 500 });
  }
}
