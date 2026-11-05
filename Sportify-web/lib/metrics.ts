import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";

/**
 * Weekly product metrics, computed from the database (never from client
 * analytics events).
 *
 * North star: WAC, weekly active competitors = distinct users with at least
 * one confirmed ranked match in the week. A "confirmed ranked match" is
 *   - a row in InternalSinglesMatches / InternalDoublesMatches (since SPO-3
 *     these only ever hold confirmed results), dated when it was confirmed;
 *   - a TournamentMatches row with a confirmed winner (result_status, see
 *     lib/tournamentResults.ts), dated when the result was recorded or
 *     confirmed (recorded_at; older rows fall back to match_date).
 *
 * Weeks are ISO weeks (Monday to Sunday) in METRICS_TZ_OFFSET_MINUTES,
 * default +330 (India, no DST).
 *
 * Retention: a user signs up in week W0. They are "retained in week N" if they
 * are a competitor in week W0 + N.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface Activity { at: Date; players: string[] }
export interface Signup { userId: string; at: Date }

export interface WeekRow {
  week: string;        // ISO week label, e.g. 2026-W45
  weekStart: string;   // Monday, YYYY-MM-DD
  wac: number;
  matches: number;
  matchesPerCompetitor: number;
  newUsers: number;
}

export interface Retention { retained: number; rate: number; complete: boolean }

export interface CohortRow {
  week: string;
  weekStart: string;
  size: number;
  w1: Retention | null; // null until that week has started
  w4: Retention | null;
}

export interface Metrics {
  generatedAt: string;
  tzOffsetMinutes: number;
  weeks: WeekRow[];    // oldest first; the last row is the current, partial week
  cohorts: CohortRow[];
}

export function tzOffsetMinutes() {
  const raw = process.env.METRICS_TZ_OFFSET_MINUTES;
  const v = raw ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : 330;
}

/** Monday 00:00 (local), as a UTC timestamp of the shifted clock. */
export function weekStartMs(d: Date, offset: number) {
  const local = new Date(d.getTime() + offset * 60_000);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
}

export function isoWeekLabel(mondayMs: number) {
  const thursday = new Date(mondayMs + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMetrics(opts: {
  activity: Activity[];
  signups: Signup[];
  now: Date;
  weeks: number;
  tzOffsetMinutes: number;
}): Metrics {
  const { activity, signups, now, weeks, tzOffsetMinutes: offset } = opts;
  const current = weekStartMs(now, offset);
  const index = (d: Date) => Math.round((weekStartMs(d, offset) - current) / WEEK); // 0 = this week, -1 = last week
  const first = -(weeks - 1);

  // week index -> competitors / match count
  const competitors = new Map<number, Set<string>>();
  const matchCount = new Map<number, number>();
  for (const a of activity) {
    const i = index(a.at);
    if (i < first || i > 0 || !a.players.length) continue;
    matchCount.set(i, (matchCount.get(i) ?? 0) + 1);
    const set = competitors.get(i) ?? new Set<string>();
    a.players.forEach(p => set.add(p));
    competitors.set(i, set);
  }

  const cohortMembers = new Map<number, string[]>();
  for (const s of signups) {
    const i = index(s.at);
    if (i < first || i > 0) continue;
    cohortMembers.set(i, [...(cohortMembers.get(i) ?? []), s.userId]);
  }

  const weekRows: WeekRow[] = [];
  const cohorts: CohortRow[] = [];
  for (let i = first; i <= 0; i++) {
    const monday = current + i * WEEK;
    const wac = competitors.get(i)?.size ?? 0;
    const matches = matchCount.get(i) ?? 0;
    const members = cohortMembers.get(i) ?? [];
    weekRows.push({
      week: isoWeekLabel(monday),
      weekStart: isoDate(monday),
      wac,
      matches,
      matchesPerCompetitor: wac ? round2(matches / wac) : 0,
      newUsers: members.length,
    });

    const retention = (n: number): Retention | null => {
      if (i + n > 0 || !members.length) return null;
      const active = competitors.get(i + n);
      const retained = members.filter(u => active?.has(u)).length;
      return { retained, rate: round2(retained / members.length), complete: i + n < 0 };
    };
    cohorts.push({
      week: isoWeekLabel(monday),
      weekStart: isoDate(monday),
      size: members.length,
      w1: retention(1),
      w4: retention(4),
    });
  }

  return { generatedAt: now.toISOString(), tzOffsetMinutes: offset, weeks: weekRows, cohorts };
}

/** Player uids from a stored JSON roster: ["uid", ...] or [{ user_id | uid | id }, ...]. */
export function parsePlayers(raw: unknown): string[] {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v
    .map(p => (typeof p === "string" ? p : p && typeof p === "object" ? (p.user_id ?? p.uid ?? p.id) : null))
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

/** Confirmed ranked matches since `since`; only those `uid` played in if given. */
export async function loadActivity(since: Date, uid?: string): Promise<Activity[]> {
  const singles = await executeQuery(
    `SELECT match_date AS at, player_1, player_2 FROM InternalSinglesMatches
     WHERE match_date >= ?${uid ? " AND ? IN (player_1, player_2)" : ""}`,
    uid ? [since, uid] : [since]
  ) as RowDataPacket[];
  const doubles = await executeQuery(
    `SELECT match_date AS at, team1_player1, team1_player2, team2_player1, team2_player2
     FROM InternalDoublesMatches
     WHERE match_date >= ?${uid ? " AND ? IN (team1_player1, team1_player2, team2_player1, team2_player2)" : ""}`,
    uid ? [since, uid] : [since]
  ) as RowDataPacket[];
  // Rosters are JSON; the LIKE pre-filter is refined by the exact match below
  const like = uid ? `%${uid.replace(/[\\%_]/g, c => `\\${c}`)}%` : null;
  const tournament = await executeQuery(
    `SELECT COALESCE(tm.recorded_at, tm.match_date) AS at,
            tm.team1_players, tm.team2_players, t1.players AS roster1, t2.players AS roster2
     FROM TournamentMatches tm
     LEFT JOIN TournamentTeams t1 ON t1.team_id = tm.team1_id
     LEFT JOIN TournamentTeams t2 ON t2.team_id = tm.team2_id
     WHERE tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed' AND COALESCE(tm.recorded_at, tm.match_date) >= ?${like
       ? " AND (tm.team1_players LIKE ? OR tm.team2_players LIKE ? OR t1.players LIKE ? OR t2.players LIKE ?)" : ""}`,
    like ? [since, like, like, like, like] : [since]
  ) as RowDataPacket[];

  const players = (...ids: unknown[]) => [...new Set(ids.filter((p): p is string => typeof p === "string" && !!p))];
  const all = [
    ...singles.map(r => ({ at: new Date(r.at), players: players(r.player_1, r.player_2) })),
    ...doubles.map(r => ({ at: new Date(r.at), players: players(r.team1_player1, r.team1_player2, r.team2_player1, r.team2_player2) })),
    ...tournament.map(r => {
      const t1 = parsePlayers(r.team1_players);
      const t2 = parsePlayers(r.team2_players);
      return {
        at: new Date(r.at),
        players: players(...(t1.length ? t1 : parsePlayers(r.roster1)), ...(t2.length ? t2 : parsePlayers(r.roster2))),
      };
    }),
  ];
  return uid ? all.filter(a => a.players.includes(uid)) : all;
}

export async function loadMetrics(weeks: number, now = new Date()): Promise<Metrics> {
  const offset = tzOffsetMinutes();
  // Load from a day before the window so the timezone shift can't drop rows
  const since = new Date(weekStartMs(now, offset) - (weeks - 1) * WEEK - offset * 60_000 - DAY);
  const activity = await loadActivity(since);
  const users = await executeQuery(
    `SELECT user_id, created_at FROM Users WHERE created_at >= ?`,
    [since]
  ) as RowDataPacket[];
  const signups = users.map(u => ({ userId: u.user_id as string, at: new Date(u.created_at) }));
  return computeMetrics({ activity, signups, now, weeks, tzOffsetMinutes: offset });
}
