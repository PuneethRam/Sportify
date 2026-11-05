import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createTournament } from "@/app/api/clans/tournaments/create_tournament/route";
import { POST as record } from "@/app/api/clans/tournaments/update_match/route";
import { POST as confirm } from "@/app/api/clans/tournaments/confirm_match/route";
import { GET as details } from "@/app/api/clans/tournaments/get_tournament_details/route";
import * as devices from "@/app/api/notifications/devices/route";
import { executeQuery } from "@/lib/db";
import { loadActivity } from "@/lib/metrics";
import { PushMessage, setPushSender } from "@/lib/notify";
import { loadSeasonMatches, seasonOf } from "@/lib/seasons";
import { createShareCard } from "@/lib/shareCards";
import { correctionBlock, TournamentResult } from "@/lib/tournamentResults";
import { call, createClan, createUser, points, uniq } from "./helpers";

// SPO-7: tournament results follow the clan rule. The bracket advances on any
// result; ratings, points, streaks, seasons and WAC wait for confirmation when
// the person entering the result played in the match.

let host: string, admin2: string, a: string, b: string, c: string, d: string, clanId: number;
let sent: { token: string; message: PushMessage }[] = [];

beforeAll(async () => {
  [host, admin2, a, b, c, d] = await Promise.all(["host", "admin2", "a", "b", "c", "d"].map(n => createUser(uniq(n))));
  clanId = await createClan({ admin: host, members: [a, b, c, d] });
  await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Admin')`, [admin2, clanId]);
  await executeQuery(`INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`, [clanId, admin2]);
  setPushSender(async (tokens, message) => {
    tokens.forEach(token => sent.push({ token, message }));
    return { delivered: tokens, invalid: [] };
  });
});
afterAll(() => setPushSender(null));
beforeEach(() => { sent = []; });

interface Match { match_id: number; team1_id: number; team2_id: number; round_number: number; winner_team_id: number | null }

/** A knockout tournament created by `host`; `teams` are rosters, paired in order in round 1. */
async function knockout(teams: string[][], type = "singles") {
  const res = await call(createTournament, { uid: host, body: {
    clanId, tournament_name: uniq("Cup"), tournament_type: type, format: "knockout", start_date: "2026-11-01",
    teams: teams.map((players, i) => ({ team_name: `T${i}`, players: JSON.stringify(players) })),
  } });
  expect(res.status).toBe(201);
  return Number(res.json.tournament_id);
}
const matchesOf = async (tournamentId: number) =>
  await executeQuery(
    `SELECT match_id, team1_id, team2_id, round_number, winner_team_id, result_status FROM TournamentMatches
     WHERE tournament_id = ? ORDER BY round_number, match_position`, [tournamentId]
  ) as (Match & { result_status: string })[];
const teamOf = async (tournamentId: number, uid: string) => {
  const [row] = await executeQuery(
    `SELECT team_id FROM TournamentTeams WHERE tournament_id = ? AND JSON_CONTAINS(players, JSON_QUOTE(?))`, [tournamentId, uid]
  ) as { team_id: number }[];
  return row.team_id;
};
const enter = (uid: string, tournamentId: number, m: Match, winner: number, t1: string[], t2: string[], score = "21-15, 21-17") =>
  call(record, { uid, body: {
    tournamentId, matchId: m.match_id, winner_team_id: winner, score_details: JSON.stringify({ score }),
    team1_players: t1, team2_players: t2,
  } });
const act = (uid: string, tournamentId: number, matchId: number, action = "confirm") =>
  call(confirm, { uid, body: { tournamentId, matchId, action } });
const ratingRows = async (matchId: number) =>
  ((await executeQuery(`SELECT COUNT(*) AS n FROM RatingHistory WHERE source = 'tournament' AND match_id = ?`, [matchId])) as { n: number }[])[0].n;
const statusOf = async (matchId: number) =>
  ((await executeQuery(`SELECT result_status FROM TournamentMatches WHERE match_id = ?`, [matchId])) as { result_status: string }[])[0].result_status;
const register = (uid: string) => {
  const token = uniq(`tok_${uid}`);
  return call(devices.POST, { uid, body: { token, platform: "android" } }).then(() => token);
};

describe("host who plays in their own tournament", () => {
  it("enters a result: it stays pending, the bracket advances, nothing is rated", async () => {
    const tid = await knockout([[host], [a], [b], [c]]);
    const [m1, m2] = await matchesOf(tid);
    const before = await points(clanId, host);

    const res = await enter(host, tid, m1, m1.team1_id, [host], [a]);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("pending");
    expect(res.json.ratingChanges).toEqual({});
    expect(await ratingRows(m1.match_id)).toBe(0);
    expect(await points(clanId, host)).toEqual(before);

    // The other semi-final (host not playing) is confirmed and rated straight away
    const other = await enter(host, tid, m2, m2.team2_id, [b], [c]);
    expect(other.json.status).toBe("confirmed");
    expect(Object.keys(other.json.ratingChanges as object).sort()).toEqual([b, c].sort());

    // The final is drawn with the host's pending win in it
    const final = (await matchesOf(tid)).find(m => m.round_number === 2)!;
    expect([final.team1_id, final.team2_id]).toEqual([m1.team1_id, m2.team2_id]);
  });

  it("can't confirm or dispute it, through confirm or by re-entering it", async () => {
    const tid = await knockout([[host], [a]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [a]);

    const self = await act(host, tid, m.match_id);
    expect(self.status).toBe(403);
    expect(self.json.error).toMatch(/You played in this match/);
    expect((await act(host, tid, m.match_id, "reject")).status).toBe(403);

    // Re-entering ("correcting") it goes back through the same rule
    const again = await enter(host, tid, m, m.team1_id, [host], [a], "21-5, 21-5");
    expect(again.json.status).toBe("pending");
    expect(await ratingRows(m.match_id)).toBe(0);

    const view = await call(details, { uid: host, method: "GET", query: { clanId, tournamentId: tid } });
    const shown = (view.json.matches as { match_id: number; result_status: string; can_resolve: boolean }[])
      .find(x => x.match_id === m.match_id)!;
    expect(shown).toMatchObject({ result_status: "pending", can_resolve: false });
    expect(await statusOf(m.match_id)).toBe("pending");
  });

  it("is confirmed by the other side: ratings and points change only then", async () => {
    const tid = await knockout([[host], [a]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [a]);
    const before = await points(clanId, host);

    const view = await call(details, { uid: a, method: "GET", query: { clanId, tournamentId: tid } });
    expect((view.json.matches as { can_resolve: boolean }[])[0].can_resolve).toBe(true);

    const res = await act(a, tid, m.match_id);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("confirmed");
    expect((res.json.ratingChanges as Record<string, number>)[host]).toBeGreaterThan(0);
    expect(await ratingRows(m.match_id)).toBe(2);
    expect((await points(clanId, host)).matcheswon).toBe(before.matcheswon + 1);

    // Already confirmed: nobody can act on it again, and it can't be corrected
    expect((await act(admin2, tid, m.match_id)).status).toBe(409);
    expect((await enter(host, tid, m, m.team2_id, [host], [a])).status).toBe(409);
  });

  it("is confirmed by a different admin who didn't play", async () => {
    const tid = await knockout([[host], [b]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [b]);
    const res = await act(admin2, tid, m.match_id);
    expect(res.json.status).toBe("confirmed");
    const [row] = await executeQuery(`SELECT recorded_by, resolved_by FROM TournamentMatches WHERE match_id = ?`, [m.match_id]) as Record<string, string>[];
    expect(row).toEqual({ recorded_by: host, resolved_by: admin2 });
  });

  it("doubles: the host's partner can't confirm it, an opponent can", async () => {
    const tid = await knockout([[host, a], [b, c]], "doubles");
    const [m] = await matchesOf(tid);
    expect((await enter(host, tid, m, m.team1_id, [host, a], [b, c])).json.status).toBe("pending");
    expect((await act(a, tid, m.match_id)).status).toBe(403);
    expect((await act(a, tid, m.match_id, "reject")).status).toBe(403);
    expect((await act(c, tid, m.match_id)).json.status).toBe("confirmed");
    expect(await ratingRows(m.match_id)).toBe(4);
  });

  it("an admin who played can't enter it for their side and have it count", async () => {
    // admin2 plays; the host (not playing) entered nothing. admin2 isn't the host but manages the clan.
    const tid = await knockout([[admin2], [d]]);
    const [m] = await matchesOf(tid);
    expect((await enter(admin2, tid, m, m.team1_id, [admin2], [d])).json.status).toBe("pending");
    expect((await act(admin2, tid, m.match_id)).status).toBe(403);
    // The host didn't play, so they can confirm it
    expect((await act(host, tid, m.match_id)).json.status).toBe("confirmed");
  });

  it("a squad member sitting the match out is still on the host's side", async () => {
    const tid = await knockout([[host, a], [b, c]]);
    const [m] = await matchesOf(tid);
    expect((await enter(host, tid, m, m.team1_id, [a], [b])).json.status).toBe("pending");
    expect((await act(a, tid, m.match_id)).status).toBe(403);
  });

  it("pending results stay out of streaks, WAC, season standings and share cards", async () => {
    const e = await createUser(uniq("e"));
    await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Member')`, [e, clanId]);
    await executeQuery(`INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`, [clanId, e]);
    const tid = await knockout([[host], [e]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [e]);

    const since = new Date(Date.now() - 86_400_000);
    expect(await loadActivity(since, e)).toEqual([]);
    const season = await loadSeasonMatches(clanId, seasonOf(new Date()));
    expect(season.some(x => x.source === "tournament" && x.matchId === m.match_id)).toBe(false);
    expect(await createShareCard(host, { kind: "match", source: "tournament", matchId: m.match_id })).toHaveProperty("error");

    await act(e, tid, m.match_id);
    expect((await loadActivity(since, e)).length).toBe(1);
    expect((await loadSeasonMatches(clanId, seasonOf(new Date()))).some(x => x.matchId === m.match_id)).toBe(true);
  });

  it("the other side gets the 'confirm your result' push, routed to the tournament", async () => {
    const [tHost, tA] = await Promise.all([register(host), register(a)]);
    const tid = await knockout([[host], [a]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [a]);
    const toA = sent.filter(s => s.token === tA);
    expect(toA.map(s => s.message.type)).toEqual(["result_needs_confirmation"]);
    expect(toA[0].message.route).toBe(`/clans/${clanId}/tournament/${tid}`);
    expect(sent.filter(s => s.token === tHost)).toEqual([]);

    sent = [];
    await act(a, tid, m.match_id);
    expect(sent.filter(s => s.token === tHost).map(s => s.message.type)).toEqual(["result_confirmed"]);
  });
});

describe("host who doesn't play", () => {
  it("gets instant confirmation and rating changes, as before", async () => {
    const tid = await knockout([[a], [b]]);
    const [m] = await matchesOf(tid);
    const res = await enter(host, tid, m, m.team1_id, [a], [b]);
    expect(res.json.status).toBe("confirmed");
    expect(Object.keys(res.json.ratingChanges as object).sort()).toEqual([a, b].sort());
    expect(await statusOf(m.match_id)).toBe("confirmed");
    expect((await act(b, tid, m.match_id)).status).toBe(409);
  });

  it("line-ups have to come from the team", async () => {
    const tid = await knockout([[a], [b]]);
    const [m] = await matchesOf(tid);
    const res = await enter(host, tid, m, m.team1_id, [c], [b]);
    expect(res.status).toBe(400);
  });
});

describe("disputes and corrections", () => {
  it("disputed by the other side, corrected by the host, then confirmed; the bracket follows the correction", async () => {
    const tid = await knockout([[host], [a], [b], [c]]);
    const [m1, m2] = await matchesOf(tid);
    const hostTeam = await teamOf(tid, host);
    const aTeam = await teamOf(tid, a);
    await enter(host, tid, m1, hostTeam, [host], [a]);
    await enter(host, tid, m2, m2.team1_id, [b], [c]);

    const disputed = await act(a, tid, m1.match_id, "reject");
    expect(disputed.json.status).toBe("disputed");
    // A player can't flip it back once disputed
    expect((await act(a, tid, m1.match_id)).status).toBe(409);

    // The host corrects it: a actually won. It goes back through the rule (host played → pending)
    const fixed = await enter(host, tid, m1, aTeam, [host], [a], "15-21, 18-21");
    expect(fixed.json.status).toBe("pending");
    const final = (await matchesOf(tid)).find(m => m.round_number === 2)!;
    expect(final.team1_id).toBe(aTeam);

    expect((await act(a, tid, m1.match_id)).json.status).toBe("confirmed");
    expect(await ratingRows(m1.match_id)).toBe(2);
  });

  it("an admin who didn't play can settle a dispute by confirming", async () => {
    const tid = await knockout([[host], [d]]);
    const [m] = await matchesOf(tid);
    await enter(host, tid, m, m.team1_id, [host], [d]);
    await act(d, tid, m.match_id, "reject");
    expect((await act(host, tid, m.match_id)).status).toBe(403);
    expect((await act(admin2, tid, m.match_id)).json.status).toBe("confirmed");
  });

  it("can't be corrected once the next round has a result", async () => {
    const tid = await knockout([[host], [a], [b], [c]]);
    const [m1, m2] = await matchesOf(tid);
    await enter(host, tid, m1, m1.team1_id, [host], [a]);
    await enter(host, tid, m2, m2.team1_id, [b], [c]);
    const final = (await matchesOf(tid)).find(m => m.round_number === 2)!;
    await enter(admin2, tid, final, final.team2_id, [host], [b]);

    const res = await enter(host, tid, m1, m1.team2_id, [host], [a]);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/next round/);
  });

  it("group matches lock once the knockout stage is drawn", () => {
    const m = { winner_team_id: 1, result_status: "pending", tournament_status: "ongoing", format: "round_robin", phase: "group", round_number: 1 } as TournamentResult;
    expect(correctionBlock(m, [{ round_number: 1, phase: "group", winner_team_id: 1 }])).toBeNull();
    expect(correctionBlock(m, [{ round_number: 2, phase: "knockout", winner_team_id: null }])).toMatch(/knockout/);
    expect(correctionBlock({ ...m, tournament_status: "completed" }, [])).toMatch(/completed/);
  });
});
