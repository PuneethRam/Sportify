import { isoWeekLabel, loadActivity, tzOffsetMinutes, weekStartMs } from "@/lib/metrics";
import { claimOnce, notify } from "@/lib/notify";

/**
 * Weekly streaks: consecutive ISO weeks (Monday to Sunday, India time, the
 * same weeks as WAC) with at least one confirmed ranked match (a clan match
 * or a tournament match, as in lib/metrics.ts).
 *
 * A streak is still "current" during a week you haven't played yet: if you
 * played in each of the last 4 weeks and not yet this week, your current
 * streak is 4, and it is at risk until Sunday night.
 */

const WEEK = 7 * 86_400_000;

export interface Streak {
  current: number;
  best: number;
  playedThisWeek: boolean;
}

export function computeStreak(dates: Date[], now: Date, offset = tzOffsetMinutes()): Streak {
  const thisWeek = weekStartMs(now, offset);
  const weeks = new Set(
    dates.map(d => Math.round((weekStartMs(d, offset) - thisWeek) / WEEK)).filter(i => i <= 0)
  );
  const playedThisWeek = weeks.has(0);
  let current = 0;
  for (let i = playedThisWeek ? 0 : -1; weeks.has(i); i--) current++;
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const i of [...weeks].sort((a, b) => a - b)) {
    run = prev !== null && i === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = i;
  }
  return { current, best, playedThisWeek };
}

export async function loadStreak(uid: string, now = new Date()): Promise<Streak> {
  const activity = await loadActivity(new Date(0), uid);
  return computeStreak(activity.map(a => a.at), now);
}

/** Smallest streak worth a "don't lose it" nudge. */
export const STREAK_NUDGE_MIN = 2;

/**
 * streak_at_risk: run on Saturday evening India time. Everyone with a current
 * streak of 2+ weeks and no match yet this week gets one nudge per week.
 */
export async function sendStreakNudges(now = new Date()) {
  const offset = tzOffsetMinutes();
  // A year of history: streak lengths in the nudge cap at 53 weeks
  const activity = await loadActivity(new Date(weekStartMs(now, offset) - 53 * WEEK - offset * 60_000 - 86_400_000));
  const dates = new Map<string, Date[]>();
  for (const a of activity) a.players.forEach(p => dates.set(p, [...(dates.get(p) ?? []), a.at]));

  const atRisk: { uid: string; streak: number }[] = [];
  dates.forEach((d, uid) => {
    const s = computeStreak(d, now, offset);
    if (!s.playedThisWeek && s.current >= STREAK_NUDGE_MIN) atRisk.push({ uid, streak: s.current });
  });
  const week = isoWeekLabel(weekStartMs(now, offset));
  const allowed = await claimOnce(atRisk.map(a => `streak_at_risk:${a.uid}:${week}`));
  let sent = 0;
  for (const { uid, streak } of atRisk) {
    if (!allowed.has(`streak_at_risk:${uid}:${week}`)) continue;
    await notify(uid, "streak_at_risk", {
      title: `Your ${streak}-week streak ends Sunday`,
      body: `Play one ranked match before Sunday midnight to make it ${streak + 1} weeks.`,
      route: "/",
    });
    sent++;
  }
  return { atRisk: atRisk.length, nudged: sent };
}
