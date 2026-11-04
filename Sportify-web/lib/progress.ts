import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { compareByRating, loadRatings, PublicRating, RatingFormat } from "@/lib/ratings";
import { loadStreak, Streak } from "@/lib/streaks";
import { closePendingSeasons, loadBadges, seasonOf, seasonStandings } from "@/lib/seasons";

/**
 * Everything the profile shows about a player's progress (and the profile
 * rank card draws): ratings, streak, badges and their place in each clan.
 * Public display information only: no email or phone.
 */

export interface ClanProgress {
  clanId: number;
  name: string;
  type: string | null;
  /** Rank by rating among the clan's members, in `format`. */
  ratingRank: number;
  members: number;
  /** This month's season standing, or null if they haven't played this month. */
  seasonRank: number | null;
  seasonPoints: number | null;
  seasonPlayers: number;
}

export interface Progress {
  userId: string;
  name: string;
  ratings: Record<RatingFormat, PublicRating>;
  /** The format they play most, used for the headline rating and ranks. */
  format: RatingFormat;
  streak: Streak;
  badges: Awaited<ReturnType<typeof loadBadges>>;
  clans: ClanProgress[];
  season: string;
}

export function primaryFormat(r: Record<RatingFormat, PublicRating>): RatingFormat {
  return r.doubles.matches > r.singles.matches ? "doubles" : "singles";
}

export async function loadProgress(uid: string, now = new Date(), opts = { closeSeasons: true }): Promise<Progress | null> {
  const [user] = await executeQuery(`SELECT user_id, name FROM Users WHERE user_id = ?`, [uid]) as RowDataPacket[];
  if (!user) return null;

  const clans = await executeQuery(
    `SELECT c.clan_id, c.name, c.type FROM ClanMembers cm JOIN Clans c ON c.clan_id = cm.clan_id
     WHERE cm.user_id = ? ORDER BY cm.join_date`,
    [uid]
  ) as RowDataPacket[];
  const clanIds = clans.map(c => Number(c.clan_id));

  // Close any finished season for their clans first, so new badges show up
  if (opts.closeSeasons) {
    try {
      await closePendingSeasons(now, clanIds);
    } catch (err) {
      console.error("[progress] closing seasons failed:", err);
    }
  }

  const ratings = (await loadRatings([uid])).get(uid)!;
  const format = primaryFormat(ratings);
  const season = seasonOf(now);

  const clanProgress: ClanProgress[] = [];
  for (const c of clans) {
    const members = await executeQuery(`SELECT user_id FROM ClanMembers WHERE clan_id = ?`, [c.clan_id]) as RowDataPacket[];
    const memberRatings = await loadRatings(members.map(m => m.user_id));
    const order = [...memberRatings.entries()]
      .sort(([, a], [, b]) => compareByRating(a[format], b[format]))
      .map(([u]) => u);
    const standings = await seasonStandings(c.clan_id, season);
    const mine = standings.find(s => s.userId === uid);
    clanProgress.push({
      clanId: Number(c.clan_id),
      name: c.name,
      type: c.type ?? null,
      ratingRank: order.indexOf(uid) + 1,
      members: order.length,
      seasonRank: mine?.rank ?? null,
      seasonPoints: mine?.points ?? null,
      seasonPlayers: standings.length,
    });
  }

  return {
    userId: uid,
    name: (user.name as string | null)?.trim() || "Sportify player",
    ratings,
    format,
    streak: await loadStreak(uid, now),
    badges: await loadBadges(uid),
    clans: clanProgress,
    season,
  };
}
