import { afterEach, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { computeMetrics, loadActivity, parsePlayers } from "@/lib/metrics";
import { call, createClan, createUser, uniq } from "./helpers";

import * as metrics from "@/app/api/admin/metrics/route";
import * as updateMatch from "@/app/api/clans/update_match/route";

const IST = 330;
// Wednesday 2026-11-04 12:00 IST
const now = new Date("2026-11-04T06:30:00Z");
const at = (iso: string) => new Date(iso);

describe("computeMetrics", () => {
  it("counts distinct competitors per ISO week in IST", () => {
    const m = computeMetrics({
      now, weeks: 3, tzOffsetMinutes: IST, signups: [],
      activity: [
        { at: at("2026-11-02T00:00:00Z"), players: ["a", "b"] },       // Mon this week
        { at: at("2026-11-03T00:00:00Z"), players: ["a", "c"] },
        { at: at("2026-11-01T18:00:00Z"), players: ["d", "e"] },       // 23:30 Sunday IST → last week
        { at: at("2026-11-01T18:31:00Z"), players: ["f", "g"] },       // 00:01 Mon IST → this week
        { at: at("2026-10-01T00:00:00Z"), players: ["old", "older"] }, // outside the window
      ],
    });
    expect(m.weeks.map(w => w.week)).toEqual(["2026-W43", "2026-W44", "2026-W45"]);
    expect(m.weeks.map(w => w.weekStart)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    const thisWeek = m.weeks[2];
    expect(thisWeek).toMatchObject({ wac: 5, matches: 3, matchesPerCompetitor: 0.6 });
    expect(m.weeks[1]).toMatchObject({ wac: 2, matches: 1 });
    expect(m.weeks[0]).toMatchObject({ wac: 0, matches: 0, matchesPerCompetitor: 0 });
  });

  it("W1 / W4 retention: competing N weeks after the signup week", () => {
    const m = computeMetrics({
      now, weeks: 6, tzOffsetMinutes: IST,
      signups: [
        { userId: "u1", at: at("2026-09-29T06:00:00Z") }, // W40, the oldest week in a 6-week window
        { userId: "u2", at: at("2026-09-30T06:00:00Z") },
        { userId: "u3", at: at("2026-10-28T06:00:00Z") }, // W44
      ],
      activity: [
        { at: at("2026-10-07T06:00:00Z"), players: ["u1", "x"] }, // W41 = W40 + 1
        { at: at("2026-10-28T06:00:00Z"), players: ["u2", "x"] }, // W44 = W40 + 4
        { at: at("2026-11-03T06:00:00Z"), players: ["u3", "x"] }, // W45 = W44 + 1, current week
      ],
    });
    const w40 = m.cohorts.find(c => c.week === "2026-W40")!;
    expect(w40.size).toBe(2);
    expect(w40.w1).toEqual({ retained: 1, rate: 0.5, complete: true });
    expect(w40.w4).toEqual({ retained: 1, rate: 0.5, complete: true });
    const w44 = m.cohorts.find(c => c.week === "2026-W44")!;
    expect(w44.w1).toEqual({ retained: 1, rate: 1, complete: false }); // this week, still running
    expect(w44.w4).toBeNull();
    expect(m.weeks.find(w => w.week === "2026-W40")!.newUsers).toBe(2);
  });

  it("ISO week numbering across the year boundary", () => {
    const m = computeMetrics({ now: at("2027-01-01T06:00:00Z"), weeks: 1, tzOffsetMinutes: IST, signups: [], activity: [] });
    expect(m.weeks[0]).toMatchObject({ week: "2026-W53", weekStart: "2026-12-28" });
  });

  it("parses rosters in either stored shape", () => {
    expect(parsePlayers('["a","b"]')).toEqual(["a", "b"]);
    expect(parsePlayers([{ user_id: "a" }, { uid: "b" }])).toEqual(["a", "b"]);
    expect(parsePlayers("not json")).toEqual([]);
  });
});

describe("loadActivity / admin endpoint", () => {
  afterEach(() => { delete process.env.PLATFORM_ADMIN_UIDS; });

  it("confirmed clan matches and recorded tournament matches count; pending submissions don't", async () => {
    const [admin, p1, p2, p3] = await Promise.all(["admin", "p1", "p2", "p3"].map(n => createUser(uniq(n))));
    const clanId = await createClan({ admin, members: [p1, p2, p3] });
    const since = new Date(Date.now() - 60_000);

    // pending (player-submitted) → not a competitor yet
    await call(updateMatch.POST, { uid: p1, body: { matchType: "singles", clanId, player1: p1, player2: p2, scoreDetails: { score: "21-10" } } });
    // admin-entered → confirmed
    await call(updateMatch.POST, { uid: admin, body: { matchType: "singles", clanId, player1: p1, player2: p3, scoreDetails: { score: "21-10" } } });
    // tournament match recorded with players
    const t = await executeQuery(`INSERT INTO Tournaments (clan_id, tournament_name, tournament_type, format) VALUES (?, 'T', 'singles', 'knockout')`, [clanId]) as { insertId: number };
    const [a, b] = await Promise.all([admin, p2].map(async p =>
      (await executeQuery(`INSERT INTO TournamentTeams (tournament_id, team_name, players) VALUES (?, ?, ?)`, [t.insertId, p, JSON.stringify([p])]) as { insertId: number }).insertId));
    await executeQuery(
      `INSERT INTO TournamentMatches (tournament_id, team1_id, team2_id, winner_team_id, match_stage, recorded_at) VALUES (?, ?, ?, ?, 'Final', NOW())`,
      [t.insertId, a, b, a]
    );

    const players = new Set((await loadActivity(since)).flatMap(x => x.players));
    expect([...players].filter(p => [admin, p1, p2, p3].includes(p)).sort()).toEqual([admin, p1, p2, p3].sort());
    // p2 only counts via the tournament, not the pending clan result
    const clanOnly = (await loadActivity(since)).filter(x => x.players.includes(p2));
    expect(clanOnly).toHaveLength(1);
  });

  it("is platform-admin only", async () => {
    const [staff, user] = await Promise.all(["staff", "user"].map(n => createUser(uniq(n))));
    expect((await call(metrics.GET, { uid: null, method: "GET" })).status).toBe(401);
    expect((await call(metrics.GET, { uid: user, method: "GET" })).status).toBe(403);
    process.env.PLATFORM_ADMIN_UIDS = `someone_else, ${staff}`;
    const res = await call(metrics.GET, { uid: staff, method: "GET", query: { weeks: 4 } });
    expect(res.status).toBe(200);
    expect(res.json.weeks).toHaveLength(4);
    expect((res.json.weeks as { wac: number }[])[3].wac).toBeGreaterThan(0);
    expect((await call(metrics.GET, { uid: user, method: "GET" })).status).toBe(403);
  });
});
