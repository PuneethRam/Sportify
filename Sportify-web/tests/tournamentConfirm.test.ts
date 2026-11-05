import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as record } from "@/app/api/clans/tournaments/update_match/route";
import { POST as confirm } from "@/app/api/clans/matches/confirm/route";
import { GET as pendingList } from "@/app/api/clans/matches/pending/route";
import { GET as details } from "@/app/api/clans/tournaments/get_tournament_details/route";
import { POST as startKnockout } from "@/app/api/clans/tournaments/start_knockout/route";
import { POST as advanceRoundRobin } from "@/app/api/clans/tournaments/advance_round_robin_to_knockout/route";
import { POST as complete } from "@/app/api/clans/tournaments/complete_tournament/route";
import * as devices from "@/app/api/notifications/devices/route";
import { executeQuery } from "@/lib/db";
import { PushMessage, setPushSender } from "@/lib/notify";
import { call, createClan, createUser, uniq } from "./helpers";

// Tournament results follow the clan rule: nobody confirms their own result.
// A host or clan admin who played in a bracket match records it as pending;
// the other side or a different host / admin confirms it, and only then does
// it move the rating and the bracket.

let admin: string, admin2: string, host: string, alice: string, bob: string, carol: string, dave: string;
let clanId: number;

let sent: { token: string; message: PushMessage }[] = [];
beforeAll(() => setPushSender(async (tokens, message) => {
  tokens.forEach(token => sent.push({ token, message }));
  return { delivered: tokens, invalid: [] };
}));
afterAll(() => setPushSender(null));
beforeEach(() => { sent = []; });

beforeAll(async () => {
  [admin, admin2, host, alice, bob, carol, dave] = await Promise.all(
    ["admin", "admin2", "host", "alice", "bob", "carol", "dave"].map(n => createUser(uniq(n)))
  );
  clanId = await createClan({ admin, members: [host, alice, bob, carol, dave] });
  await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Admin')`, [admin2, clanId]);
});

/** A tournament hosted by `createdBy` with one team per roster and the given round-1 pairings. */
async function tournament(opts: {
  rosters: string[][]; pairs: [number, number][]; type?: "singles" | "doubles";
  format?: string; createdBy?: string; phase?: "group" | "knockout";
}) {
  const t = await executeQuery(
    `INSERT INTO Tournaments (clan_id, tournament_name, tournament_type, format, status, created_by)
     VALUES (?, ?, ?, ?, 'ongoing', ?)`,
    [clanId, uniq("cup"), opts.type ?? "singles", opts.format ?? "knockout", opts.createdBy ?? host]
  ) as { insertId: number };
  const teams: number[] = [];
  for (const [i, roster] of opts.rosters.entries()) {
    const r = await executeQuery(
      `INSERT INTO TournamentTeams (tournament_id, team_name, players) VALUES (?, ?, ?)`,
      [t.insertId, `Team ${i + 1}`, JSON.stringify(roster.map(u => ({ user_id: u, name: u })))]
    ) as { insertId: number };
    teams.push(r.insertId);
  }
  const matches: number[] = [];
  for (const [pos, [a, b]] of opts.pairs.entries()) {
    const m = await executeQuery(
      `INSERT INTO TournamentMatches (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
       VALUES (?, ?, ?, 'Round 1', 1, ?, ?)`,
      [t.insertId, teams[a], teams[b], pos, opts.phase ?? (opts.format === "knockout" || !opts.format ? "knockout" : "group")]
    ) as { insertId: number };
    matches.push(m.insertId);
  }
  return { tournamentId: t.insertId, teams, matches };
}

const result = (tournamentId: number, matchId: number, winner: number, extra: Record<string, unknown> = {}) => ({
  tournamentId, matchId, winner_team_id: winner,
  score_details: JSON.stringify({ score: "21-15, 21-18", games: [{ team1: 21, team2: 15 }, { team1: 21, team2: 18 }] }),
  ...extra,
});
const act = (uid: string, submissionId: unknown, action = "confirm") =>
  call(confirm, { uid, body: { submissionId, action } });
const matchRow = async (matchId: number) =>
  ((await executeQuery(`SELECT winner_team_id, recorded_by, team1_players FROM TournamentMatches WHERE match_id = ?`, [matchId])) as Record<string, unknown>[])[0];
const ratedRows = async (matchId: number) =>
  ((await executeQuery(`SELECT COUNT(*) AS n FROM RatingHistory WHERE source = 'tournament' AND match_id = ?`, [matchId])) as { n: number }[])[0].n;
const roundCount = async (tournamentId: number, round: number) =>
  ((await executeQuery(`SELECT COUNT(*) AS n FROM TournamentMatches WHERE tournament_id = ? AND round_number = ?`, [tournamentId, round])) as { n: number }[])[0].n;

describe("host who played", () => {
  it("stays pending: no winner, no rating, no next round, and the host can't confirm it", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice], [bob], [carol]], pairs: [[0, 1], [2, 3]] });
    // the other semi is already decided by a host who didn't play
    expect((await call(record, { uid: host, body: result(tournamentId, matches[1], teams[2]) })).json.status).toBe("confirmed");

    const res = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ status: "pending", ratingChanges: {} });
    expect((await matchRow(matches[0])).winner_team_id).toBeNull();
    expect(await ratedRows(matches[0])).toBe(0);
    expect(await roundCount(tournamentId, 2)).toBe(0);

    const self = await act(host, res.json.submissionId);
    expect(self.status).toBe(403);
    expect(self.json.error).toMatch(/You played in this match/);
    // can't be recorded again over the top
    expect((await call(record, { uid: admin, body: result(tournamentId, matches[0], teams[1]) })).status).toBe(409);
  });

  it("opponent confirms → rating moves and the winner goes through to the final", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice], [bob], [carol]], pairs: [[0, 1], [2, 3]] });
    await call(record, { uid: host, body: result(tournamentId, matches[1], teams[2]) });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });

    const res = await act(alice, json.submissionId);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("confirmed");
    expect(Object.keys(res.json.ratingChanges as object).sort()).toEqual([alice, host].sort());

    expect(await matchRow(matches[0])).toMatchObject({ winner_team_id: teams[0], recorded_by: host });
    expect(await ratedRows(matches[0])).toBe(2);
    const [final] = await executeQuery(
      `SELECT team1_id, team2_id, match_stage FROM TournamentMatches WHERE tournament_id = ? AND round_number = 2`,
      [tournamentId]
    ) as Record<string, unknown>[];
    expect(final).toEqual({ team1_id: teams[0], team2_id: teams[2], match_stage: "Final" });
    // confirming twice doesn't count it twice
    expect((await act(alice, json.submissionId)).status).toBe(409);
  });

  it("a different clan admin can confirm it", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice]], pairs: [[0, 1]] });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    expect((await act(admin, json.submissionId)).json.status).toBe("confirmed");
    const [row] = await executeQuery(`SELECT submitted_by, resolved_by FROM MatchSubmissions WHERE submission_id = ?`, [json.submissionId]) as Record<string, string>[];
    expect(row).toEqual({ submitted_by: host, resolved_by: admin });
  });

  it("an admin who plays in someone else's tournament waits too; the host confirms it", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[admin], [bob]], pairs: [[0, 1]] });
    const { json } = await call(record, { uid: admin, body: result(tournamentId, matches[0], teams[0]) });
    expect(json.status).toBe("pending");
    expect((await act(admin, json.submissionId)).status).toBe(403);
    expect((await act(host, json.submissionId)).json.status).toBe("confirmed");
  });

  it("doubles: the host's partner can't confirm; a player on the other side can", async () => {
    const { tournamentId, teams, matches } = await tournament({
      type: "doubles", rosters: [[host, alice], [bob, carol]], pairs: [[0, 1]],
    });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    expect(json.status).toBe("pending");
    expect((await act(alice, json.submissionId)).status).toBe(403);
    expect((await act(carol, json.submissionId)).json.status).toBe("confirmed");
    expect(await ratedRows(matches[0])).toBe(4);
  });

  it("a dispute is settled by an admin who didn't play, not by the host", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice]], pairs: [[0, 1]] });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    expect((await act(alice, json.submissionId, "reject")).json.status).toBe("disputed");
    expect((await act(host, json.submissionId)).status).toBe(403);
    expect((await act(alice, json.submissionId)).status).toBe(409);
    expect((await act(admin2, json.submissionId)).json.status).toBe("confirmed");
    expect((await matchRow(matches[0])).winner_team_id).toBe(teams[0]);
  });

  it("the other side gets the confirmation push, routed to the tournament", async () => {
    const tok = uniq("tok");
    await call(devices.POST, { uid: alice, body: { token: tok, platform: "android" } });
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice]], pairs: [[0, 1]] });
    await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    const push = sent.find(s => s.token === tok);
    expect(push?.message.type).toBe("result_needs_confirmation");
    expect(push?.message.route).toBe(`/clans/${clanId}/tournament/${tournamentId}`);
  });

  it("the bracket shows it waiting, with canConfirm for whoever can resolve it", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice]], pairs: [[0, 1]] });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    const pendingFor = async (uid: string) => {
      const r = await call(details, { uid, method: "GET", query: { clanId, tournamentId } });
      return (r.json.matches as { match_id: number; winner_team_id: number | null; pending_result: Record<string, unknown> | null }[])
        .find(m => m.match_id === matches[0])!;
    };
    const asHost = await pendingFor(host);
    expect(asHost.winner_team_id).toBeNull();
    expect(asHost.pending_result).toMatchObject({
      submissionId: json.submissionId, status: "pending", winnerTeamId: teams[0], submittedBy: host, canConfirm: false,
    });
    expect((await pendingFor(alice)).pending_result?.canConfirm).toBe(true);
    expect((await pendingFor(admin)).pending_result?.canConfirm).toBe(true);
    expect((await pendingFor(bob)).pending_result?.canConfirm).toBe(false);
    // and it isn't listed with the clan's own pending results
    const list = await call(pendingList, { uid: admin, method: "GET", query: { clanId } });
    expect((list.json.data as { submissionId: number }[]).some(d => d.submissionId === json.submissionId)).toBe(false);
  });
});

describe("host who didn't play", () => {
  it("counts at once, as before", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[alice], [bob]], pairs: [[0, 1]] });
    const res = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[1]) });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("confirmed");
    expect(await matchRow(matches[0])).toMatchObject({ winner_team_id: teams[1], recorded_by: host });
    expect(await ratedRows(matches[0])).toBe(2);
  });

  it("a lineup has to come from the team's roster, so the host can't leave themselves out", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host], [alice]], pairs: [[0, 1]] });
    const res = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0], { team1_players: [bob], team2_players: [alice] }) });
    expect(res.status).toBe(400);
    expect((await matchRow(matches[0])).winner_team_id).toBeNull();
  });

  it("a host on a bigger team who sits this match out records it at once; with no lineup they're asked who played", async () => {
    const { tournamentId, teams, matches } = await tournament({ rosters: [[host, alice, dave], [bob]], pairs: [[0, 1]] });
    const unknown = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toMatch(/pick who played/);
    const res = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0], { team1_players: [alice], team2_players: [bob] }) });
    expect(res.json.status).toBe("confirmed");
  });
});

describe("a pending result holds the tournament", () => {
  it("blocks start_knockout and complete_tournament until confirmed", async () => {
    const { tournamentId, teams, matches } = await tournament({
      format: "group_knockout", rosters: [[host], [alice], [bob], [carol]], pairs: [[0, 1], [2, 3]],
    });
    const g = await executeQuery(`INSERT INTO TournamentGroups (tournament_id, group_name) VALUES (?, 'A')`, [tournamentId]) as { insertId: number };
    for (const t of teams) await executeQuery(`INSERT INTO TournamentGroupTeams (group_id, team_id) VALUES (?, ?)`, [g.insertId, t]);
    await call(record, { uid: host, body: result(tournamentId, matches[1], teams[2]) });
    const { json } = await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });

    const ko = await call(startKnockout, { uid: host, body: { clanId, tournamentId } });
    expect(ko.status).toBe(409);
    expect(ko.json.error).toMatch(/1 result is waiting for confirmation/);
    const done = await call(complete, { uid: admin, body: { clanId, tournamentId } });
    expect(done.status).toBe(409);
    expect(((await executeQuery(`SELECT status FROM Tournaments WHERE tournament_id = ?`, [tournamentId])) as { status: string }[])[0].status).toBe("ongoing");

    await act(alice, json.submissionId);
    expect((await call(startKnockout, { uid: host, body: { clanId, tournamentId } })).status).toBe(200);
  });

  it("blocks moving a round robin to the knockout", async () => {
    const { tournamentId, teams, matches } = await tournament({
      format: "round_robin", rosters: [[host], [alice], [bob]], pairs: [[0, 1], [1, 2], [0, 2]],
    });
    await call(record, { uid: host, body: result(tournamentId, matches[0], teams[0]) });
    const res = await call(advanceRoundRobin, { uid: host, body: { clanId, tournamentId, advancingCount: 2 } });
    expect(res.status).toBe(409);
  });
});

describe("emulator guard", () => {
  it("only trusts emulator tokens with SPORTIFY_E2E=1 and off Netlify", async () => {
    const { emulatorAllowed } = await vi.importActual<typeof import("@/lib/firebaseAdmin")>("@/lib/firebaseAdmin");
    const host = { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
    expect(emulatorAllowed({ ...host, SPORTIFY_E2E: "1" })).toBe(true);
    expect(emulatorAllowed(host)).toBe(false);
    expect(emulatorAllowed({ ...host, SPORTIFY_E2E: "true" })).toBe(false);
    expect(emulatorAllowed({ ...host, SPORTIFY_E2E: "1", NETLIFY: "true" })).toBe(false);
    expect(emulatorAllowed({ SPORTIFY_E2E: "1" })).toBe(false);
  });

  it("removes a stray FIREBASE_AUTH_EMULATOR_HOST so firebase-admin keeps checking signatures", async () => {
    vi.resetModules();
    const keys = ["FIREBASE_AUTH_EMULATOR_HOST", "SPORTIFY_E2E", "NETLIFY"] as const;
    const saved = keys.map(k => process.env[k]);
    Object.assign(process.env, { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", SPORTIFY_E2E: "1", NETLIFY: "true" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await vi.importActual("@/lib/firebaseAdmin");
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
      expect(error.mock.calls.some(c => String(c[0]).includes("Ignoring FIREBASE_AUTH_EMULATOR_HOST"))).toBe(true);
    } finally {
      error.mockRestore();
      keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
    }
  });
});
