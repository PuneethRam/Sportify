import { RowDataPacket } from "mysql2";
import { createConnection, executeQuery } from "@/lib/db";
import { tzOffsetMinutes } from "@/lib/metrics";
import { claimOnce, displayName, notify } from "@/lib/notify";
import {
  compareMatches, DOUBLES_SELECT, fromDoublesRow, fromSinglesRow, fromTournamentRow, MatchSource,
  RatedMatch, SINGLES_SELECT, TOURNAMENT_SELECT,
} from "@/lib/ratings";
import { isProvisional } from "@/lib/glicko2";
import { determineWinner, marginScoring } from "@/lib/scoring";

/**
 * Monthly seasons.
 *
 * A season is a calendar month in India time (the same clock as WAC). Each
 * clan / batch has a season standing: season points from that clan's
 * confirmed matches in the month (clan matches and its tournaments), using
 * the leaderboard points rule in lib/scoring.ts: winners gain the points,
 * losers lose them, never below zero. Ratings are not reset.
 *
 * Standings are computed on read. A season is "closed" once, after it ends,
 * by whichever comes first: the daily cron (/api/cron/close-seasons) or
 * someone viewing a profile. Closing awards the badges and sends the
 * season_ended push. SeasonClosures makes it happen exactly once.
 */

/** Seasons before this are history from before seasons existed: no badges or pushes. */
export const FIRST_SEASON = "2026-11";

export type Badge = "champion" | "top3" | "most_matches" | "biggest_gain";

export const BADGE_LABELS: Record<Badge, string> = {
  champion: "Season champion",
  top3: "Top 3",
  most_matches: "Most matches played",
  biggest_gain: "Biggest rating gain",
};

export interface Standing {
  userId: string;
  rank: number;
  points: number;
  played: number;
  won: number;
  lost: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" of the month `d` falls in, India time. */
export function seasonOf(d: Date, offset = tzOffsetMinutes()) {
  const local = new Date(d.getTime() + offset * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}`;
}

export const isSeason = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** [start, end) of a season as real instants. */
export function seasonBounds(season: string, offset = tzOffsetMinutes()) {
  const [y, m] = season.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - offset * 60_000),
    end: new Date(Date.UTC(y, m, 1) - offset * 60_000),
  };
}

export function previousSeason(season: string) {
  const [y, m] = season.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** "November 2026" */
export function seasonName(season: string) {
  const [y, m] = season.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Season standing from a season's matches (pure). Only players with a match
 * are listed. Ties: more points, then more wins, then more matches.
 */
export function computeStandings(matches: RatedMatch[]): Standing[] {
  const rows = new Map<string, Standing>();
  const row = (u: string) => {
    let r = rows.get(u);
    if (!r) rows.set(u, (r = { userId: u, rank: 0, points: 0, played: 0, won: 0, lost: 0 }));
    return r;
  };
  for (const m of [...matches].sort(compareMatches)) {
    const players = [...m.team1, ...m.team2];
    if (!m.team1.length || !m.team2.length) continue;
    players.forEach(p => row(p).played++);
    if (!m.winner) continue;
    const pts = marginScoring.pointsFor(
      { clanId: m.clanId ?? 0, format: m.format, team1: m.team1, team2: m.team2, score: m.score ?? "" },
      m.winner
    );
    (m.winner === "team1" ? m.team1 : m.team2).forEach(p => { const r = row(p); r.points += pts; r.won++; });
    (m.winner === "team1" ? m.team2 : m.team1).forEach(p => { const r = row(p); r.points = Math.max(r.points - pts, 0); r.lost++; });
  }
  const list = [...rows.values()].sort((a, b) =>
    b.points - a.points || b.won - a.won || b.played - a.played || a.userId.localeCompare(b.userId));
  list.forEach((r, i) => { r.rank = i + 1; r.points = round1(r.points); });
  return list;
}

export interface BadgeAward { userId: string; badge: Badge; rank: number | null; value: number | null }

/**
 * Badges for a finished season (pure):
 *   champion      — 1st in the standing
 *   top3          — 2nd and 3rd (1st gets champion instead)
 *   most_matches  — most matches played (everyone tied for most)
 *   biggest_gain  — biggest total rating gain from this clan's matches in the
 *                   month, among players who were rated (not provisional)
 *                   in singles or doubles at season end; must be above zero
 */
export function awardBadges(
  standings: Standing[],
  ratingGain: Map<string, number>,
  ratedAtEnd: Set<string>
): BadgeAward[] {
  const out: BadgeAward[] = [];
  standings.slice(0, 3).forEach(s => out.push({
    userId: s.userId, badge: s.rank === 1 ? "champion" : "top3", rank: s.rank, value: s.points,
  }));
  const most = Math.max(0, ...standings.map(s => s.played));
  if (most > 0) standings.filter(s => s.played === most).forEach(s =>
    out.push({ userId: s.userId, badge: "most_matches", rank: null, value: most }));
  const gains = [...ratingGain.entries()].filter(([u, g]) => ratedAtEnd.has(u) && g > 0);
  const best = Math.max(0, ...gains.map(([, g]) => g));
  if (best > 0) gains.filter(([, g]) => g === best).forEach(([u]) =>
    out.push({ userId: u, badge: "biggest_gain", rank: null, value: Math.round(best) }));
  return out;
}

/** A clan's confirmed matches in a season, clan and tournament. */
export async function loadSeasonMatches(clanId: number | string, season: string): Promise<RatedMatch[]> {
  const { start, end } = seasonBounds(season);
  const singles = await executeQuery(
    `${SINGLES_SELECT} WHERE clan_id = ? AND match_date >= ? AND match_date < ?`, [clanId, start, end]
  ) as RowDataPacket[];
  const doubles = await executeQuery(
    `${DOUBLES_SELECT} WHERE clan_id = ? AND match_date >= ? AND match_date < ?`, [clanId, start, end]
  ) as RowDataPacket[];
  const tournament = await executeQuery(
    `${TOURNAMENT_SELECT} AND t.clan_id = ? AND COALESCE(tm.recorded_at, tm.match_date) >= ? AND COALESCE(tm.recorded_at, tm.match_date) < ?`,
    [clanId, start, end]
  ) as RowDataPacket[];
  // Legacy clan rows may lack a stored winner; fall back to the score as the leaderboard did
  return [...singles.map(fromSinglesRow), ...doubles.map(fromDoublesRow), ...tournament.map(fromTournamentRow)]
    .map(m => (m.winner || m.source === "tournament" ? m : { ...m, winner: determineWinner(m.score) }));
}

export async function seasonStandings(clanId: number | string, season: string) {
  return computeStandings(await loadSeasonMatches(clanId, season));
}

const clanName = async (clanId: number | string) => {
  const [c] = await executeQuery(`SELECT name FROM Clans WHERE clan_id = ?`, [clanId]) as RowDataPacket[];
  return (c?.name as string | undefined) ?? "your clan";
};

/** Players rated (not provisional) in either format as of `end`, from RatingHistory. */
async function ratedAt(uids: string[], end: Date): Promise<Set<string>> {
  if (!uids.length) return new Set();
  const rows = await executeQuery(
    `SELECT user_id, format, rd_after FROM RatingHistory
     WHERE played_at < ? AND user_id IN (${uids.map(() => "?").join(",")})
     ORDER BY played_at, id`,
    [end, ...uids]
  ) as RowDataPacket[];
  const state = new Map<string, { rd: number; matches: number }>();
  for (const r of rows) {
    const k = `${r.user_id}:${r.format}`;
    state.set(k, { rd: Number(r.rd_after), matches: (state.get(k)?.matches ?? 0) + 1 });
  }
  const rated = new Set<string>();
  state.forEach((s, k) => { if (!isProvisional(s)) rated.add(k.slice(0, k.lastIndexOf(":"))); });
  return rated;
}

/**
 * Closes one clan's season if it has ended and isn't closed yet: stores the
 * badges and sends season_ended. Returns the awards, or null if there was
 * nothing to do.
 */
export async function closeSeason(clanId: number, season: string, now = new Date()): Promise<BadgeAward[] | null> {
  if (season < FIRST_SEASON) return null;
  const { start, end } = seasonBounds(season);
  if (end > now) return null;

  const standings = await seasonStandings(clanId, season);
  const gains = await executeQuery(
    `SELECT user_id, SUM(rating_after - rating_before) AS gain FROM RatingHistory
     WHERE clan_id = ? AND played_at >= ? AND played_at < ? GROUP BY user_id`,
    [clanId, start, end]
  ) as RowDataPacket[];
  const gain = new Map(gains.map(g => [g.user_id as string, Number(g.gain)]));
  const awards = awardBadges(standings, gain, await ratedAt([...gain.keys()], end));

  const conn = await createConnection();
  try {
    await conn.beginTransaction();
    const [claimed] = await conn.execute(
      `INSERT IGNORE INTO SeasonClosures (clan_id, season, players) VALUES (?, ?, ?)`,
      [clanId, season, standings.length]
    ) as unknown as [{ affectedRows: number }];
    if (claimed.affectedRows === 0) {
      await conn.rollback();
      return null;
    }
    for (const a of awards) {
      await conn.execute(
        `INSERT IGNORE INTO SeasonBadges (clan_id, season, user_id, badge, rank_pos, value) VALUES (?, ?, ?, ?, ?, ?)`,
        [clanId, season, a.userId, a.badge, a.rank, a.value]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }

  if (standings.length) {
    const name = await clanName(clanId);
    const month = seasonName(season).split(" ")[0];
    for (const s of standings) {
      const mine = awards.filter(a => a.userId === s.userId).map(a => BADGE_LABELS[a.badge]);
      await notify(s.userId, "season_ended", {
        title: `${month} season in ${name} is over`,
        body: `You finished #${s.rank} of ${standings.length} with ${s.points} points.`
          + (mine.length ? ` Badge: ${mine.join(", ")}.` : ""),
        route: `/clans/${clanId}`,
      });
    }
  }
  return awards;
}

/**
 * Closes every finished, unclosed season with matches (the last three months,
 * from FIRST_SEASON on). Optionally only for some clans.
 */
export async function closePendingSeasons(now = new Date(), clanIds?: number[]) {
  if (clanIds && !clanIds.length) return 0;
  let season = previousSeason(seasonOf(now));
  let closed = 0;
  for (let i = 0; i < 3 && season >= FIRST_SEASON; i++, season = previousSeason(season)) {
    const { start, end } = seasonBounds(season);
    const only = clanIds ? ` AND clan_id IN (${clanIds.map(() => "?").join(",")})` : "";
    const rows = await executeQuery(
      `SELECT DISTINCT a.clan_id FROM (
         SELECT clan_id FROM InternalSinglesMatches WHERE match_date >= ? AND match_date < ?
         UNION SELECT clan_id FROM InternalDoublesMatches WHERE match_date >= ? AND match_date < ?
         UNION SELECT t.clan_id FROM TournamentMatches tm JOIN Tournaments t ON t.tournament_id = tm.tournament_id
               WHERE tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'
                 AND COALESCE(tm.recorded_at, tm.match_date) >= ? AND COALESCE(tm.recorded_at, tm.match_date) < ?
       ) a
       WHERE a.clan_id IS NOT NULL${only}
         AND NOT EXISTS (SELECT 1 FROM SeasonClosures sc WHERE sc.clan_id = a.clan_id AND sc.season = ?)`,
      [start, end, start, end, start, end, ...(clanIds ?? []), season]
    ) as RowDataPacket[];
    for (const r of rows) {
      if (await closeSeason(Number(r.clan_id), season, now)) closed++;
    }
  }
  return closed;
}

/** India-time calendar date, for "once per day" keys. */
const istDay = (d: Date) => new Date(d.getTime() + tzOffsetMinutes() * 60_000).toISOString().slice(0, 10);

/**
 * After new confirmed results in a clan: tell everyone who was passed in this
 * season's standing ("Rahul just passed you in Smash Club"). At most one
 * rank_overtaken per user per clan per day. Never throws.
 */
export async function notifyOvertakes(clanId: number | string, newMatches: { source: MatchSource; matchId: number }[], now = new Date()) {
  try {
    const matches = await loadSeasonMatches(clanId, seasonOf(now));
    const isNew = (m: RatedMatch) => newMatches.some(n => n.source === m.source && n.matchId === m.matchId);
    if (!matches.some(isNew)) return;
    const before = new Map(computeStandings(matches.filter(m => !isNew(m))).map(s => [s.userId, s.rank]));
    const after = new Map(computeStandings(matches).map(s => [s.userId, s.rank]));

    // Only players in the new results "pass" anyone (someone who didn't play
    // can move up when the person above them loses, but didn't pass them)
    const movers = new Set(matches.filter(isNew).flatMap(m => [...m.team1, ...m.team2]));
    const passedBy = new Map<string, string[]>();
    for (const [u, rankBefore] of before) {
      const rankAfter = after.get(u)!;
      const passers = [...after.entries()]
        .filter(([v, r]) => movers.has(v) && v !== u && r < rankAfter && (before.get(v) ?? Infinity) > rankBefore)
        .sort((a, b) => a[1] - b[1])
        .map(([v]) => v);
      if (passers.length) passedBy.set(u, passers);
    }
    if (!passedBy.size) return;

    const day = istDay(now);
    const allowed = await claimOnce([...passedBy.keys()].map(u => `rank_overtaken:${u}:${clanId}:${day}`));
    const name = await clanName(clanId);
    for (const [u, passers] of passedBy) {
      if (!allowed.has(`rank_overtaken:${u}:${clanId}:${day}`)) continue;
      const who = await displayName(passers[0]);
      await notify(u, "rank_overtaken", {
        title: "You've been overtaken",
        body: `${who}${passers.length > 1 ? ` and ${passers.length - 1} other${passers.length > 2 ? "s" : ""}` : ""} just passed you in ${name}. You're #${after.get(u)} this season.`,
        route: `/clans/${clanId}`,
      });
    }
  } catch (err) {
    console.error("[seasons] overtake notifications failed:", err);
  }
}

/** A user's badges, newest season first. */
export async function loadBadges(uid: string) {
  const rows = await executeQuery(
    `SELECT b.clan_id, c.name AS clan_name, b.season, b.badge, b.rank_pos, b.value, b.awarded_at
     FROM SeasonBadges b LEFT JOIN Clans c ON c.clan_id = b.clan_id
     WHERE b.user_id = ? ORDER BY b.season DESC, FIELD(b.badge, 'champion', 'top3', 'biggest_gain', 'most_matches')`,
    [uid]
  ) as RowDataPacket[];
  return rows.map(r => ({
    clanId: Number(r.clan_id),
    clanName: r.clan_name as string | null,
    season: r.season as string,
    seasonName: seasonName(r.season),
    badge: r.badge as Badge,
    label: BADGE_LABELS[r.badge as Badge],
    rank: r.rank_pos == null ? null : Number(r.rank_pos),
    value: r.value == null ? null : Number(r.value),
  }));
}
