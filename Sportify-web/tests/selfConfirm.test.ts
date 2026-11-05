import { beforeAll, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/clans/update_match/route";
import { POST as confirm } from "@/app/api/clans/matches/confirm/route";
import { POST as bulk } from "@/app/api/clans/matches/bulk/route";
import { GET as pending } from "@/app/api/clans/matches/pending/route";
import { executeQuery } from "@/lib/db";
import { call, createClan, createUser, points, uniq } from "./helpers";

// Nobody confirms their own result: a clan admin who played in a match goes
// through the pending path like any player, through single and bulk entry.

let admin: string, admin2: string, alice: string, bob: string, carol: string, clanId: number;

beforeAll(async () => {
  [admin, admin2, alice, bob, carol] = await Promise.all(
    ["admin", "admin2", "alice", "bob", "carol"].map(n => createUser(uniq(n)))
  );
  clanId = await createClan({ admin, members: [alice, bob, carol] });
  await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Admin')`, [admin2, clanId]);
  await executeQuery(`INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`, [clanId, admin2]);
});

const singles = (p1: string, p2: string, score = "21-11") => ({
  matchType: "singles", clanId, player1: p1, player2: p2, scoreDetails: { score },
});
const act = (uid: string, submissionId: unknown, action = "confirm") =>
  call(confirm, { uid, body: { submissionId, action } });
const statusOf = async (submissionId: unknown) =>
  ((await executeQuery(`SELECT status FROM MatchSubmissions WHERE submission_id = ?`, [submissionId])) as { status: string }[])[0].status;

describe("single entry by an admin who played", () => {
  it("stays pending and off the leaderboard", async () => {
    const before = await points(clanId, admin);
    const res = await call(submit, { uid: admin, body: singles(admin, alice) });
    expect(res.status).toBe(201);
    expect(res.json.status).toBe("pending");
    expect(res.json.matchId).toBeNull();
    expect((await points(clanId, admin)).matchesplayed).toBe(before.matchesplayed);
  });

  it("can't be confirmed or disputed by that admin", async () => {
    const { json } = await call(submit, { uid: admin, body: singles(admin, alice) });
    const self = await act(admin, json.submissionId);
    expect(self.status).toBe(403);
    expect(self.json.error).toMatch(/You played in this match/);
    expect((await act(admin, json.submissionId, "reject")).status).toBe(403);
    expect(await statusOf(json.submissionId)).toBe("pending");
  });

  it("is confirmed by the opponent", async () => {
    const { json } = await call(submit, { uid: admin, body: singles(admin, alice) });
    const before = await points(clanId, admin);
    const res = await act(alice, json.submissionId);
    expect(res.json.status).toBe("confirmed");
    expect((await points(clanId, admin)).matcheswon).toBe(before.matcheswon + 1);
  });

  it("is confirmed by a different admin", async () => {
    const { json } = await call(submit, { uid: admin, body: singles(admin, bob) });
    const res = await act(admin2, json.submissionId);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("confirmed");
    const [row] = await executeQuery(`SELECT submitted_by, resolved_by FROM MatchSubmissions WHERE submission_id = ?`, [json.submissionId]) as Record<string, string>[];
    expect(row).toEqual({ submitted_by: admin, resolved_by: admin2 });
  });

  it("doubles: the admin's partner can't confirm it either", async () => {
    const body = {
      matchType: "doubles", clanId, scoreDetails: { score: "21-19" },
      team1Player1: admin, team1Player2: alice, team2Player1: bob, team2Player2: carol,
    };
    const { json } = await call(submit, { uid: admin, body });
    expect(json.status).toBe("pending");
    expect((await act(alice, json.submissionId)).status).toBe(403);
    expect((await act(carol, json.submissionId)).json.status).toBe("confirmed");
  });
});

describe("confirm by an admin who played", () => {
  it("can still confirm a player's result as the opponent", async () => {
    const { json } = await call(submit, { uid: alice, body: singles(alice, admin) });
    expect(json.status).toBe("pending");
    expect((await act(admin, json.submissionId)).json.status).toBe("confirmed");
  });

  it("can't override a dispute in a match they played; a different admin can", async () => {
    const { json } = await call(submit, { uid: alice, body: singles(alice, admin) });
    expect((await act(admin, json.submissionId, "reject")).json.status).toBe("disputed");
    expect((await act(admin, json.submissionId)).status).toBe(403);
    expect((await act(admin2, json.submissionId)).json.status).toBe("confirmed");
  });

  it("can't confirm a result their partner submitted", async () => {
    const body = {
      matchType: "doubles", clanId, scoreDetails: { score: "21-19" },
      team1Player1: alice, team1Player2: admin, team2Player1: bob, team2Player2: carol,
    };
    const { json } = await call(submit, { uid: alice, body });
    expect((await act(admin, json.submissionId)).status).toBe(403);
    expect(await statusOf(json.submissionId)).toBe("pending");
  });

  it("pending list: canConfirm is off for the admin who played, on for the other admin", async () => {
    const { json } = await call(submit, { uid: admin, body: singles(admin, carol) });
    const find = async (uid: string) => {
      const r = await call(pending, { uid, method: "GET", query: { clanId } });
      return (r.json.data as { submissionId: number; canConfirm: boolean }[]).find(d => d.submissionId === json.submissionId);
    };
    expect((await find(admin))?.canConfirm).toBe(false);
    expect((await find(admin2))?.canConfirm).toBe(true);
    expect((await find(carol))?.canConfirm).toBe(true);
  });
});

describe("bulk entry", () => {
  let owner: string, coach: string, students: string[], batchId: number;

  beforeAll(async () => {
    [owner, coach] = await Promise.all(["owner", "coach"].map(n => createUser(uniq(n))));
    students = await Promise.all(Array.from({ length: 4 }, (_, i) => createUser(uniq(`st${i}`))));
    const org = await executeQuery(`INSERT INTO Organisations (name, owner_user_id) VALUES (?, ?)`, [uniq("org"), owner]) as { insertId: number };
    batchId = await createClan({ admin: coach, members: students, type: "batch", orgId: org.insertId });
  });

  it("confirms the coach's class at once when the coach didn't play", async () => {
    const res = await call(bulk, { uid: coach, body: { clanId: batchId, matches: [
      { matchType: "singles", player1: students[0], player2: students[1], score: "21-10" },
    ] } });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ recorded: 1, confirmed: 1, pending: 0 });
    const [r] = res.json.results as { status: string; matchId: number }[];
    expect(r.status).toBe("confirmed");
    expect(r.matchId).toBeTruthy();
  });

  it("leaves results the coach played in pending, and the coach can't confirm them", async () => {
    const before = await points(batchId, coach);
    const res = await call(bulk, { uid: coach, body: { clanId: batchId, matches: [
      { matchType: "singles", player1: students[2], player2: students[3], score: "21-10" },
      { matchType: "singles", player1: coach, player2: students[0], score: "21-5" },
      { matchType: "doubles", team1Player1: students[1], team1Player2: students[2], team2Player1: coach, team2Player2: students[3], score: "15-21" },
    ] } });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ recorded: 3, confirmed: 1, pending: 2 });
    const results = res.json.results as { submissionId: number; status: string; matchId: number | null; ratingChanges: Record<string, number> }[];
    expect(results.map(r => r.status)).toEqual(["confirmed", "pending", "pending"]);
    expect(results[1]).toMatchObject({ matchId: null, ratingChanges: {} });
    expect((await points(batchId, coach)).matchesplayed).toBe(before.matchesplayed);

    // Coach can't self-confirm; the coach's doubles partner can't either
    expect((await act(coach, results[1].submissionId)).status).toBe(403);
    expect((await act(students[3], results[2].submissionId)).status).toBe(403);

    // Other side confirms; a different admin (the academy owner) can too
    expect((await act(students[0], results[1].submissionId)).json.status).toBe("confirmed");
    expect((await act(owner, results[2].submissionId)).json.status).toBe("confirmed");
    expect((await points(batchId, coach)).matchesplayed).toBe(before.matchesplayed + 2);
  });

  it("an academy owner who plays in their own batch also waits", async () => {
    await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Member')`, [owner, batchId]);
    await executeQuery(`INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`, [batchId, owner]);
    const res = await call(bulk, { uid: owner, body: { clanId: batchId, matches: [
      { matchType: "singles", player1: owner, player2: students[1], score: "21-5" },
    ] } });
    const [r] = res.json.results as { submissionId: number; status: string }[];
    expect(r.status).toBe("pending");
    expect((await act(owner, r.submissionId)).status).toBe(403);
    expect((await act(coach, r.submissionId)).json.status).toBe("confirmed");
  });
});
