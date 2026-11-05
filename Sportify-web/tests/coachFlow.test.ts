import { describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { loadMetrics } from "@/lib/metrics";
import { call, uniq } from "./helpers";

import * as addUser from "@/app/api/addUser/route";
import * as createOrg from "@/app/api/organisations/create/route";
import * as createBatch from "@/app/api/organisations/create_batch/route";
import * as invites from "@/app/api/invites/route";
import * as invite from "@/app/api/invites/[token]/route";
import * as accept from "@/app/api/invites/[token]/accept/route";
import * as members from "@/app/api/clans/get_clanmembers/route";
import * as bulk from "@/app/api/clans/matches/bulk/route";
import * as progress from "@/app/api/players/progress/route";
import * as season from "@/app/api/clans/season/route";

// A coach's first week, through the API only, in the order the app does it:
// sign up → organisation → batch → invite link → students join → the coach
// records the class → ratings, streaks and season standings move → the
// students count as weekly active competitors.
describe("coach first-week flow", () => {
  it("runs end to end", async () => {
    const signUp = async (name: string) => {
      const uid = uniq(name);
      const res = await call(addUser.POST, { uid, body: { name, email: `${uid}@test.local` } });
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      return uid;
    };
    const coach = await signUp("Coach Priya");
    const students = await Promise.all(["Arun", "Divya", "Karthik", "Meena"].map(signUp));

    // Organisation and batch
    const org = await call(createOrg.POST, { uid: coach, body: { name: uniq("Velachery Shuttlers") } });
    expect(org.status, JSON.stringify(org.json)).toBe(201);
    const batch = await call(createBatch.POST, { uid: coach, body: { orgId: org.json.orgId, name: "Saturday 7am" } });
    expect(batch.status, JSON.stringify(batch.json)).toBe(201);
    const batchId = batch.json.batchId as number;

    // Invite link: students open it, see the batch, and join
    const link = await call(invites.POST, { uid: coach, body: { type: "batch", id: batchId } });
    expect(link.status, JSON.stringify(link.json)).toBe(201);
    const token = link.json.token as string;
    const preview = await call(invite.GET, { method: "GET", params: { token } });
    expect(preview.json).toMatchObject({ type: "batch", status: "active" });
    for (const s of students) {
      const joined = await call(accept.POST, { uid: s, params: { token } });
      expect(joined.status, JSON.stringify(joined.json)).toBe(200);
    }
    const roster = await call(members.GET, { uid: coach, method: "GET", query: { clanId: batchId } });
    const rosterIds = JSON.stringify(roster.json);
    for (const s of students) expect(rosterIds).toContain(s);

    // Coach records the class
    const wacBefore = (await loadMetrics(1)).weeks[0].wac;
    const [arun, divya, karthik, meena] = students;
    const recorded = await call(bulk.POST, { uid: coach, body: { clanId: batchId, matches: [
      { matchType: "singles", player1: arun, player2: divya, score: "21-15, 21-18" },
      { matchType: "singles", player1: karthik, player2: meena, score: "18-21, 21-19, 21-12" },
      { matchType: "doubles", team1Player1: arun, team1Player2: meena, team2Player1: divya, team2Player2: karthik, score: "21-17, 21-16" },
    ] } });
    expect(recorded.status, JSON.stringify(recorded.json)).toBe(201);
    expect(recorded.json).toMatchObject({ recorded: 3, confirmed: 3, pending: 0 });

    // Ratings and streak on the winner's profile, as another student sees it
    const arunProgress = await call(progress.GET, { uid: divya, method: "GET", query: { userId: arun } });
    expect(arunProgress.status).toBe(200);
    expect(arunProgress.json.ratings).toMatchObject({
      singles: { matches: 1, provisional: true }, doubles: { matches: 1, provisional: true },
    });
    expect(arunProgress.json.streak).toEqual({ current: 1, best: 1, playedThisWeek: true });
    const batchProgress = (arunProgress.json.clans as { clanId: number; seasonRank: number | null; seasonPlayers: number }[])
      .find(c => c.clanId === batchId);
    expect(batchProgress).toMatchObject({ seasonRank: 1, seasonPlayers: 4 });

    // Season standings for the batch
    const standings = await call(season.GET, { uid: meena, method: "GET", query: { clanId: batchId } });
    expect(standings.status).toBe(200);
    const rows = standings.json.standings as { userId: string; rank: number; played: number; won: number }[];
    expect(rows.map(r => r.userId).sort()).toEqual([...students].sort());
    expect(rows.find(r => r.userId === arun)).toMatchObject({ rank: 1, played: 2, won: 2 });
    expect(rows.find(r => r.userId === divya)).toMatchObject({ played: 2, won: 0 });

    // The four students are this week's new active competitors; the coach isn't
    const wacAfter = (await loadMetrics(1)).weeks[0].wac;
    expect(wacAfter - wacBefore).toBe(4);
  });

  it("profile creation is idempotent, so Google sign-in can call it every time", async () => {
    const uid = uniq("google");
    expect((await call(addUser.POST, { uid, body: { name: "Divya R", email: `${uid}@test.local` } })).status).toBe(200);
    expect((await call(addUser.POST, { uid, body: { name: "Google User", email: `${uid}@test.local` } })).status).toBe(200);
    const [row] = await executeQuery(`SELECT name FROM Users WHERE user_id = ?`, [uid]) as { name: string }[];
    expect(row.name).toBe("Divya R");
  });
});
