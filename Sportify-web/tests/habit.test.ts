import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { PushMessage, setPushSender } from "@/lib/notify";
import { computeStreak, sendStreakNudges } from "@/lib/streaks";
import {
  awardBadges, closeSeason, computeStandings, notifyOvertakes, seasonBounds, seasonOf, Standing,
} from "@/lib/seasons";
import { RatedMatch } from "@/lib/ratings";
import { safeNextPath } from "@/lib/nextPath";
import { call, createClan, createUser, uniq } from "./helpers";

import * as bulk from "@/app/api/clans/matches/bulk/route";
import * as devices from "@/app/api/notifications/devices/route";
import * as progress from "@/app/api/players/progress/route";
import * as season from "@/app/api/clans/season/route";
import * as share from "@/app/api/share/route";
import * as og from "@/app/api/og/[token]/route";
import * as cron from "@/app/api/cron/[job]/route";

let sent: { token: string; message: PushMessage }[] = [];
beforeAll(() => setPushSender(async (tokens, message) => {
  tokens.forEach(token => sent.push({ token, message }));
  return { delivered: tokens, invalid: [] };
}));
afterAll(() => setPushSender(null));
beforeEach(() => { sent = []; });

const register = (uid: string) => {
  const token = uniq(`tok_${uid}`);
  return call(devices.POST, { uid, body: { token, platform: "android" } }).then(() => token);
};
const pushes = (token: string, type?: string) => sent.filter(s => s.token === token && (!type || s.message.type === type));

const singles = (a: string, b: string, score = "21-10, 21-10") => ({ matchType: "singles", player1: a, player2: b, score });

describe("coach bulk entry", () => {
  let owner: string, coach: string, students: string[], outsider: string, batchId: number;

  beforeAll(async () => {
    [owner, coach, outsider] = await Promise.all(["owner", "coach", "outsider"].map(n => createUser(uniq(n))));
    students = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(uniq(`s${i}`))));
    const org = await executeQuery(`INSERT INTO Organisations (name, owner_user_id) VALUES (?, ?)`, [uniq("org"), owner]) as { insertId: number };
    batchId = await createClan({ admin: coach, members: students, type: "batch", orgId: org.insertId });
  });

  const body = () => ({
    clanId: batchId,
    matches: [
      singles(students[0], students[1]),
      singles(students[2], students[3], "18-21, 21-19, 21-15"),
      { matchType: "doubles", team1Player1: students[0], team1Player2: students[2], team2Player1: students[4], team2Player2: students[5], score: "21-17, 21-16" },
    ],
  });

  it("coach and academy owner may record a class; a student and an outsider get 403", async () => {
    expect((await call(bulk.POST, { uid: students[0], body: body() })).status).toBe(403);
    expect((await call(bulk.POST, { uid: outsider, body: body() })).status).toBe(403);

    const byCoach = await call(bulk.POST, { uid: coach, body: body() });
    expect(byCoach.status, JSON.stringify(byCoach.json)).toBe(201);
    expect(byCoach.json.recorded).toBe(3);
    const byOwner = await call(bulk.POST, { uid: owner, body: { clanId: batchId, matches: [singles(students[4], students[5])] } });
    expect(byOwner.status).toBe(201);
  });

  it("results are confirmed at once, audited, rated, and players get result_confirmed", async () => {
    const tokens = await Promise.all(students.slice(0, 2).map(register));
    const res = await call(bulk.POST, { uid: coach, body: { clanId: batchId, matches: [singles(students[0], students[1])] } });
    const [r] = res.json.results as { submissionId: number; matchId: number; ratingChanges: Record<string, number> }[];
    const [row] = await executeQuery(`SELECT * FROM MatchSubmissions WHERE submission_id = ?`, [r.submissionId]) as Record<string, unknown>[];
    expect(row).toMatchObject({ status: "confirmed", submitted_by: coach, resolved_by: coach, entry_method: "bulk", match_id: r.matchId });
    expect(r.ratingChanges[students[0]]).toBeGreaterThan(0);
    expect(r.ratingChanges[students[1]]).toBeLessThan(0);
    for (const t of tokens) expect(pushes(t, "result_confirmed").length).toBe(1);
  });

  it("is all or nothing, and only for batch members", async () => {
    const count = async () => (await executeQuery(`SELECT COUNT(*) AS n FROM MatchSubmissions WHERE clan_id = ?`, [batchId]) as { n: number }[])[0].n;
    const before = await count();
    const bad = await call(bulk.POST, { uid: coach, body: { clanId: batchId, matches: [singles(students[0], students[1]), singles(students[2], students[2])] } });
    expect(bad.status).toBe(400);
    expect(bad.json.index).toBe(1);
    const stranger = await call(bulk.POST, { uid: coach, body: { clanId: batchId, matches: [singles(students[0], outsider)] } });
    expect(stranger.status).toBe(400);
    expect(await count()).toBe(before);
  });
});

describe("weekly streaks", () => {
  // Weeks are Monday–Sunday in India time (UTC+5:30)
  const ist = (s: string) => new Date(`${s}+05:30`);

  it("counts consecutive IST weeks and splits at Monday 00:00 IST", () => {
    const now = ist("2026-11-18T12:00:00"); // Wednesday
    // Sunday 23:30 IST is still the old week; Monday 00:15 IST is the new one
    expect(computeStreak([ist("2026-11-15T23:30:00")], now)).toEqual({ current: 1, best: 1, playedThisWeek: false });
    expect(computeStreak([ist("2026-11-16T00:15:00")], now)).toEqual({ current: 1, best: 1, playedThisWeek: true });
    // 23:30 IST Sunday is 18:00 UTC Sunday — same UTC day, but a different week only in IST
    expect(ist("2026-11-15T23:30:00").toISOString()).toBe("2026-11-15T18:00:00.000Z");
    expect(computeStreak([ist("2026-11-16T00:15:00")], ist("2026-11-15T23:59:00")).current).toBe(0);
  });

  it("keeps the streak current until the week ends, and tracks the best", () => {
    const now = ist("2026-11-21T19:00:00"); // Saturday evening
    const weeks = ["2026-10-05", "2026-10-12", "2026-10-13", "2026-10-19", /* gap */ "2026-11-02", "2026-11-09", "2026-11-16"];
    const s = computeStreak(weeks.map(d => ist(`${d}T18:00:00`)), now);
    expect(s).toEqual({ current: 3, best: 3, playedThisWeek: true });
    const atRisk = computeStreak(weeks.slice(0, -1).map(d => ist(`${d}T18:00:00`)), now);
    expect(atRisk).toEqual({ current: 2, best: 3, playedThisWeek: false });
    expect(computeStreak([], now)).toEqual({ current: 0, best: 0, playedThisWeek: false });
  });

  it("streak_at_risk: once a week to players with a 2+ week streak and no match this week", async () => {
    const coach = await createUser(uniq("coach"));
    const [keen, lapsed, fresh] = await Promise.all(["keen", "lapsed", "fresh"].map(n => createUser(uniq(n))));
    const clanId = await createClan({ admin: coach, members: [keen, lapsed, fresh] });
    const now = new Date();
    const weekAgo = (n: number) => new Date(now.getTime() - n * 7 * 86_400_000);
    const add = (a: string, b: string, at: Date) => executeQuery(
      `INSERT INTO InternalSinglesMatches (clan_id, player_1, player_2, score_details, winner_player, match_date) VALUES (?, ?, ?, '21-10', ?, ?)`,
      [clanId, a, b, a, at]
    );
    await add(keen, lapsed, weekAgo(1));
    await add(keen, lapsed, weekAgo(2));
    await add(keen, fresh, now); // keen has played this week
    const [tk, tl, tf] = await Promise.all([keen, lapsed, fresh].map(register));

    await sendStreakNudges(now);
    await sendStreakNudges(now);
    expect(pushes(tl, "streak_at_risk").length).toBe(1);
    expect(pushes(tl)[0].message.title).toMatch(/2-week streak/);
    expect(pushes(tk).length).toBe(0);
    expect(pushes(tf).length).toBe(0);
  });

  it("shows current and best streak on the profile", async () => {
    const coach = await createUser(uniq("coach"));
    const [a, b] = await Promise.all(["a", "b"].map(n => createUser(uniq(n))));
    const clanId = await createClan({ admin: coach, members: [a, b] });
    await call(bulk.POST, { uid: coach, body: { clanId, matches: [singles(a, b)] } });
    const res = await call(progress.GET, { uid: b, method: "GET", query: { userId: a } });
    expect(res.status).toBe(200);
    expect(res.json.streak).toEqual({ current: 1, best: 1, playedThisWeek: true });
    expect(res.json.ratings).toMatchObject({ singles: { matches: 1, provisional: true } });
    expect(JSON.stringify(res.json)).not.toMatch(/@test\.local/);
  });
});

describe("seasons and badges", () => {
  const m = (id: number, t1: string[], t2: string[], winner: "team1" | "team2" | null, score: string, s = id): RatedMatch => ({
    source: "clan_singles", matchId: id, clanId: 1, format: t1.length === 2 ? "doubles" : "singles",
    team1: t1, team2: t2, winner, score, playedAt: new Date(Date.UTC(2026, 10, 2, 10, 0, s)),
  });

  it("uses India-time month boundaries", () => {
    expect(seasonOf(new Date("2026-11-30T18:29:00Z"))).toBe("2026-11");
    expect(seasonOf(new Date("2026-11-30T18:30:00Z"))).toBe("2026-12");
    expect(seasonBounds("2026-12")).toEqual({ start: new Date("2026-11-30T18:30:00Z"), end: new Date("2026-12-31T18:30:00Z") });
  });

  it("standings use the leaderboard points rule, floored at zero", () => {
    const st = computeStandings([
      m(1, ["a"], ["b"], "team1", "21-11"),        // a +7, b 0 (floored)
      m(2, ["b"], ["c"], "team1", "21-19, 21-19"), // b +5.8, c 0
      m(3, ["a"], ["c"], "team1", "21-0"),         // a +9.2
      m(4, ["c"], ["d"], null, "21-21"),           // draw: played only
    ]);
    expect(st.map(s => [s.userId, s.rank, s.points, s.played, s.won])).toEqual([
      ["a", 1, 16.2, 2, 2], ["b", 2, 5.8, 2, 1], ["c", 3, 0, 3, 0], ["d", 4, 0, 1, 0],
    ]);
  });

  it("awards champion, top 3, most matches and biggest rating gain (rated only)", () => {
    const st: Standing[] = [
      { userId: "a", rank: 1, points: 30, played: 5, won: 5, lost: 0 },
      { userId: "b", rank: 2, points: 20, played: 9, won: 4, lost: 5 },
      { userId: "c", rank: 3, points: 10, played: 9, won: 3, lost: 6 },
      { userId: "d", rank: 4, points: 0, played: 2, won: 0, lost: 2 },
    ];
    const gain = new Map([["a", 80], ["b", 40], ["d", -10]]);
    const awards = awardBadges(st, gain, new Set(["b", "c", "d"])); // a is still provisional
    expect(awards).toEqual([
      { userId: "a", badge: "champion", rank: 1, value: 30 },
      { userId: "b", badge: "top3", rank: 2, value: 20 },
      { userId: "c", badge: "top3", rank: 3, value: 10 },
      { userId: "b", badge: "most_matches", rank: null, value: 9 },
      { userId: "c", badge: "most_matches", rank: null, value: 9 },
      { userId: "b", badge: "biggest_gain", rank: null, value: 40 },
    ]);
  });

  it("closes a season once: stores badges, sends season_ended, shows them on the profile", async () => {
    const coach = await createUser(uniq("coach"));
    const ps = await Promise.all(["a", "b", "c", "d"].map(n => createUser(uniq(n))));
    const clanId = await createClan({ admin: coach, members: ps, type: "batch" });
    const [ta, , , td] = await Promise.all(ps.map(register));
    await call(bulk.POST, { uid: coach, body: { clanId, matches: [
      singles(ps[0], ps[1]), singles(ps[0], ps[2]), singles(ps[1], ps[2]), singles(ps[3], ps[2]), singles(ps[0], ps[3]),
    ] } });

    const current = seasonOf(new Date());
    expect(await closeSeason(clanId, current)).toBeNull(); // not over yet
    const after = new Date(seasonBounds(current).end.getTime() + 3600_000);
    const awards = await closeSeason(clanId, current, after);
    expect(awards!.find(a => a.badge === "champion")!.userId).toBe(ps[0]);
    expect(awards!.filter(a => a.badge === "most_matches").map(a => a.userId).sort()).toEqual([ps[0], ps[2]].sort());
    expect(await closeSeason(clanId, current, after)).toBeNull(); // only once

    expect(pushes(ta, "season_ended").length).toBe(1);
    expect(pushes(ta, "season_ended")[0].message.body).toMatch(/#1 of 4.*Season champion/);
    expect(pushes(td, "season_ended")[0].message.body).toMatch(/#\d of 4/);

    const prof = await call(progress.GET, { uid: ps[0], method: "GET" });
    expect((prof.json.badges as { badge: string }[]).map(b => b.badge)).toContain("champion");

    const view = await call(season.GET, { uid: ps[1], method: "GET", query: { clanId, season: current } });
    expect(view.status).toBe(200);
    expect((view.json.standings as { userId: string }[])[0].userId).toBe(ps[0]);
    expect((await call(season.GET, { uid: await createUser(uniq("x")), method: "GET", query: { clanId } })).status).toBe(403);
  });

  it("rank_overtaken: tells the people you passed, at most once per clan per day", async () => {
    const coach = await createUser(uniq("coach"));
    const [top, mid, climber] = await Promise.all(["top", "mid", "climber"].map(n => createUser(uniq(n))));
    await executeQuery(`UPDATE Users SET name = 'Rahul' WHERE user_id = ?`, [climber]);
    const clanId = await createClan({ admin: coach, members: [top, mid, climber] });
    const [tTop, tMid] = await Promise.all([top, mid].map(register));
    await call(bulk.POST, { uid: coach, body: { clanId, matches: [singles(top, mid, "21-15"), singles(mid, climber, "21-19")] } });
    sent = [];

    // Rahul beats top by a lot: passes both top and mid
    await call(bulk.POST, { uid: coach, body: { clanId, matches: [singles(climber, top, "21-0, 21-0")] } });
    expect(pushes(tTop, "rank_overtaken").length).toBe(1);
    expect(pushes(tTop, "rank_overtaken")[0].message.body).toMatch(/^Rahul just passed you in /);
    expect(pushes(tMid, "rank_overtaken").length).toBe(1);

    // Same day again: no second push
    await call(bulk.POST, { uid: coach, body: { clanId, matches: [singles(mid, top, "21-0, 21-0"), singles(climber, mid, "21-0, 21-0")] } });
    expect(pushes(tTop, "rank_overtaken").length).toBe(1);
    expect(pushes(tMid, "rank_overtaken").length).toBe(1);

    await notifyOvertakes(clanId, [{ source: "clan_singles", matchId: -1 }]); // not this season's: no-op
  });
});

describe("share cards", () => {
  let coach: string, a: string, b: string, outsider: string, clanId: number, matchId: number;

  beforeAll(async () => {
    [coach, a, b, outsider] = await Promise.all(["coach", "a", "b", "outsider"].map(n => createUser(uniq(n))));
    await executeQuery(`UPDATE Users SET name = 'Priya S', email = 'priya@example.com', phone = '+919999999999' WHERE user_id = ?`, [a]).catch(() =>
      executeQuery(`UPDATE Users SET name = 'Priya S', email = 'priya@example.com' WHERE user_id = ?`, [a]));
    clanId = await createClan({ admin: coach, members: [a, b] });
    const res = await call(bulk.POST, { uid: coach, body: { clanId, matches: [singles(a, b)] } });
    matchId = (res.json.results as { matchId: number }[])[0].matchId;
  });

  it("only clan members share a match; you only share your own profile", async () => {
    const body = { kind: "match", source: "clan_singles", matchId };
    expect((await call(share.POST, { uid: outsider, body })).status).toBe(403);
    const ok = await call(share.POST, { uid: a, body });
    expect(ok.status).toBe(200);
    expect(ok.json.url).toMatch(/\/s\/[A-Za-z0-9_-]{24}$/);
    expect((await call(share.POST, { uid: a, body })).json.token).toBe(ok.json.token); // reused
    expect((await call(share.POST, { uid: outsider, body: { kind: "profile", clanId } })).status).toBe(403);
    expect((await call(share.POST, { uid: a, body: { kind: "profile", clanId } })).status).toBe(200);
  });

  it("renders PNG cards with display names only, and links to the clan invite when an admin shared", async () => {
    const { loadCard } = await import("@/lib/shareCards");
    const m = await call(share.POST, { uid: coach, body: { kind: "match", source: "clan_singles", matchId } });
    const card = await loadCard(m.json.token);
    expect(card).toMatchObject({ kind: "match", team1: [{ name: "Priya S" }] });
    expect(card!.inviteToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const text = JSON.stringify(card);
    expect(text).not.toMatch(/priya@example\.com|\+91|@test\.local/);
    expect(text).not.toContain(a);

    const p = await call(share.POST, { uid: a, body: { kind: "profile", clanId } });
    const profile = await loadCard(p.json.token);
    expect(profile).toMatchObject({ kind: "profile", name: "Priya S", provisional: true, clanRank: expect.any(Number), streak: 1 });

    const img = await og.GET(new Request("http://test.local/api/og/x"), { params: Promise.resolve({ token: p.json.token as string }) });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});

describe("cron", () => {
  it("needs CRON_SECRET", async () => {
    const run = (auth?: string) => cron.POST(
      new Request("http://test.local/api/cron/close-seasons", { method: "POST", headers: auth ? { Authorization: auth } : {} }),
      { params: Promise.resolve({ job: "close-seasons" }) }
    );
    delete process.env.CRON_SECRET;
    expect((await run("Bearer anything")).status).toBe(401);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await run()).status).toBe(401);
    expect((await run("Bearer wrong")).status).toBe(401);
    const ok = await run("Bearer s3cret-value");
    expect(ok.status).toBe(200);
    delete process.env.CRON_SECRET;
  });
});

describe("nextPath", () => {
  const origin = "https://sportifyweb.netlify.app";
  it("keeps same-site paths", () => {
    expect(safeNextPath("/i/abc?x=1#y", origin)).toBe("/i/abc?x=1#y");
    expect(safeNextPath("/dashboard", origin)).toBe("/dashboard");
  });
  it("rejects other origins, including backslash tricks", () => {
    for (const bad of ["/\\evil.com", "/\\/evil.com", "//evil.com", "/\t/evil.com", "https://evil.com", "evil.com", "", null, "javascript:alert(1)"]) {
      expect(safeNextPath(bad, origin), String(bad)).toBeNull();
    }
  });
});
