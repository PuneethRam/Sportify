import { beforeAll, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/clans/update_match/route";
import { POST as confirm } from "@/app/api/clans/matches/confirm/route";
import { GET as pending } from "@/app/api/clans/matches/pending/route";
import { executeQuery } from "@/lib/db";
import { call, createClan, createUser, points, uniq } from "./helpers";

let admin: string, alice: string, bob: string, carol: string, dave: string, outsider: string, clanId: number;

beforeAll(async () => {
  [admin, alice, bob, carol, dave, outsider] = await Promise.all(
    ["admin", "alice", "bob", "carol", "dave", "outsider"].map(n => createUser(uniq(n)))
  );
  clanId = await createClan({ admin, members: [alice, bob, carol, dave] });
});

const singles = (p1: string, p2: string, score = "21-11") => ({
  matchType: "singles", clanId, player1: p1, player2: p2, scoreDetails: { score },
});

describe("opponent result confirmation", () => {
  it("keeps a player-submitted result pending and off the leaderboard", async () => {
    const res = await call(submit, { uid: alice, body: singles(alice, bob) });
    expect(res.status).toBe(201);
    expect(res.json.status).toBe("pending");
    expect(res.json.matchId).toBeNull();
    expect((await points(clanId, alice)).matchesplayed).toBe(0);
    const rows = await executeQuery(`SELECT * FROM InternalSinglesMatches WHERE clan_id = ?`, [clanId]) as unknown[];
    expect(rows).toHaveLength(0);
  });

  it("only lets the other side (or an admin) confirm", async () => {
    const { json } = await call(submit, { uid: alice, body: singles(alice, bob) });
    const submissionId = json.submissionId;

    expect((await call(confirm, { uid: alice, body: { submissionId, action: "confirm" } })).status).toBe(403);
    expect((await call(confirm, { uid: carol, body: { submissionId, action: "confirm" } })).status).toBe(403);
    expect((await call(confirm, { uid: outsider, body: { submissionId, action: "confirm" } })).status).toBe(403);

    const before = await points(clanId, alice);
    const ok = await call(confirm, { uid: bob, body: { submissionId, action: "confirm" } });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe("confirmed");

    const a = await points(clanId, alice), b = await points(clanId, bob);
    expect(a.clan_points - before.clan_points).toBeCloseTo(7);
    expect(a.matcheswon).toBe(before.matcheswon + 1);
    expect(b.matcheslost).toBeGreaterThanOrEqual(1);

    // Confirming twice must not count it twice
    const again = await call(confirm, { uid: bob, body: { submissionId, action: "confirm" } });
    expect(again.status).toBe(409);
    expect((await points(clanId, alice)).clan_points).toBeCloseTo(a.clan_points);
  });

  it("lets the opponent dispute, after which only an admin can confirm", async () => {
    const { json } = await call(submit, { uid: carol, body: singles(carol, dave, "21-5") });
    const submissionId = json.submissionId;

    const rej = await call(confirm, { uid: dave, body: { submissionId, action: "reject" } });
    expect(rej.json.status).toBe("disputed");
    expect((await call(confirm, { uid: dave, body: { submissionId, action: "confirm" } })).status).toBe(409);

    const before = await points(clanId, carol);
    const override = await call(confirm, { uid: admin, body: { submissionId, action: "confirm" } });
    expect(override.json.status).toBe("confirmed");
    expect((await points(clanId, carol)).matcheswon).toBe(before.matcheswon + 1);
  });

  it("confirms an admin-submitted result immediately", async () => {
    const before = await points(clanId, bob);
    const res = await call(submit, { uid: admin, body: singles(bob, carol) });
    expect(res.json.status).toBe("confirmed");
    expect(res.json.matchId).toBeTruthy();
    expect((await points(clanId, bob)).matcheswon).toBe(before.matcheswon + 1);
  });

  it("requires doubles confirmation from the opposing pair", async () => {
    const body = {
      matchType: "doubles", clanId, scoreDetails: { score: "21-19, 21-17" },
      team1Player1: alice, team1Player2: bob, team2Player1: carol, team2Player2: dave,
    };
    const { json } = await call(submit, { uid: alice, body });
    expect((await call(confirm, { uid: bob, body: { submissionId: json.submissionId, action: "confirm" } })).status).toBe(403);
    const before = await points(clanId, bob);
    expect((await call(confirm, { uid: dave, body: { submissionId: json.submissionId, action: "confirm" } })).json.status).toBe("confirmed");
    const after = await points(clanId, bob);
    expect(after.doubles_points).toBeGreaterThan(before.doubles_points);
  });

  it("rejects submissions from non-players and with non-member players", async () => {
    expect((await call(submit, { uid: carol, body: singles(alice, bob) })).status).toBe(403);
    expect((await call(submit, { uid: outsider, body: singles(outsider, bob) })).status).toBe(403);
    expect((await call(submit, { uid: alice, body: singles(alice, outsider) })).status).toBe(400);
    expect((await call(submit, { uid: alice, body: singles(alice, alice) })).status).toBe(400);
  });

  it("lists pending results with canConfirm for the opponent only", async () => {
    const { json } = await call(submit, { uid: alice, body: singles(alice, dave) });
    const forDave = await call(pending, { uid: dave, method: "GET", query: { clanId } });
    const forAlice = await call(pending, { uid: alice, method: "GET", query: { clanId } });
    const find = (r: { json: Record<string, unknown> }) =>
      (r.json.data as { submissionId: number; canConfirm: boolean }[]).find(d => d.submissionId === json.submissionId);
    expect(find(forDave)?.canConfirm).toBe(true);
    expect(find(forAlice)?.canConfirm).toBe(false);
    expect((await call(pending, { uid: outsider, method: "GET", query: { clanId } })).status).toBe(403);
  });
});
