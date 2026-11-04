import { beforeAll, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { isProvisional, newRating, rateMatch, RATING_CONFIG, teamComposite, update } from "@/lib/glicko2";
import { recomputeRatings, replay, RatedMatch } from "@/lib/ratings";
import { call, createClan, createUser, uniq } from "./helpers";

import * as updateMatch from "@/app/api/clans/update_match/route";
import * as confirm from "@/app/api/clans/matches/confirm/route";
import * as bulk from "@/app/api/clans/matches/bulk/route";
import * as leaderboard from "@/app/api/clans/leaderboard/route";
import * as getMatches from "@/app/api/clans/get_matches/route";
import * as createSeries from "@/app/api/clans/series/create_series/route";
import * as deleteSeries from "@/app/api/clans/series/delete_series/route";
import * as createTournament from "@/app/api/clans/tournaments/create_tournament/route";
import * as tournamentDetails from "@/app/api/clans/tournaments/get_tournament_details/route";
import * as tournamentMatch from "@/app/api/clans/tournaments/update_match/route";

describe("Glicko-2", () => {
  it("matches Glickman's worked example", () => {
    // Glickman, "Example of the Glicko-2 system" (2013): 1500/200/0.06 beats
    // 1400/30, loses to 1550/100 and 1700/300, τ = 0.5 → 1464.06 / 151.52 / 0.05999
    const r = update({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30 }, score: 1 },
      { opponent: { rating: 1550, rd: 100 }, score: 0 },
      { opponent: { rating: 1700, rd: 300 }, score: 0 },
    ], 0.5);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    // The paper truncates σ' to 0.05999; the exact value is 0.0599959...
    expect(r.volatility).toBeCloseTo(0.05999, 4);
    expect(r.volatility).toBeCloseTo(0.059996, 6);
  });

  it("uses one config for the defaults", () => {
    expect(newRating()).toEqual({ rating: 1500, rd: 350, volatility: 0.06 });
    expect(RATING_CONFIG.tau).toBe(0.5);
  });

  it("is zero-sum between equal new players and moves the winner up", () => {
    const [[a], [b]] = rateMatch([newRating()], [newRating()], 1);
    expect(a.rating).toBeGreaterThan(1500);
    expect(a.rating - 1500).toBeCloseTo(1500 - b.rating, 6);
    expect(a.rd).toBeLessThan(350);
  });

  it("doubles: pairs play as mean rating / RMS RD; both partners move by the pair's change", () => {
    const vet = { rating: 1800, rd: 60, volatility: 0.06 };
    const rookie = newRating();
    expect(teamComposite([vet, rookie])).toEqual({ rating: 1650, rd: Math.sqrt((60 ** 2 + 350 ** 2) / 2), volatility: 0.06 });
    const [[v2, r2]] = rateMatch([vet, rookie], [newRating(), newRating()], 1);
    expect(v2.rating - vet.rating).toBeCloseTo(r2.rating - rookie.rating, 9);
    expect(v2.rating).toBeGreaterThan(vet.rating);
    // Each keeps their own uncertainty, shrunk by the same factor
    expect(v2.rd / vet.rd).toBeCloseTo(r2.rd / rookie.rd, 9);
    expect(r2.rd).toBeGreaterThan(v2.rd);
  });

  it("is provisional until 10 rated matches or RD below 110", () => {
    expect(isProvisional({ matches: 0, rd: 350 })).toBe(true);
    expect(isProvisional({ matches: 9, rd: 110 })).toBe(true);
    expect(isProvisional({ matches: 10, rd: 200 })).toBe(false);
    expect(isProvisional({ matches: 3, rd: 109.9 })).toBe(false);
  });

  it("replay skips unrateable matches and orders by time", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, s));
    const base = { source: "clan_singles" as const, clanId: 1, format: "singles" as const };
    const ms: RatedMatch[] = [
      { ...base, matchId: 2, team1: ["a"], team2: ["b"], winner: "team2", playedAt: at(2) },
      { ...base, matchId: 1, team1: ["a"], team2: ["b"], winner: "team1", playedAt: at(1) },
      { ...base, matchId: 3, team1: ["a"], team2: ["b"], winner: null, playedAt: at(3) },
      { ...base, matchId: 4, team1: ["a"], team2: ["a"], winner: "team1", playedAt: at(4) },
    ];
    const { history, ratings } = replay(ms);
    expect(history.map(h => h.matchId)).toEqual([1, 1, 2, 2]);
    expect(ratings.get("singles:a")!.matches).toBe(2);
  });
});

describe("ratings in the database", () => {
  let coach: string, p: string[], clanId: number;

  const snapshot = async (uids: string[]) => {
    const ratings = await executeQuery(
      `SELECT user_id, format, rating, rd, volatility, matches FROM PlayerRatings
       WHERE user_id IN (${uids.map(() => "?").join(",")}) ORDER BY user_id, format`, uids
    ) as Record<string, unknown>[];
    const history = await executeQuery(
      `SELECT source, match_id, user_id, rating_before, rating_after, rd_after FROM RatingHistory
       WHERE user_id IN (${uids.map(() => "?").join(",")}) ORDER BY source, match_id, user_id`, uids
    ) as Record<string, unknown>[];
    return { ratings, history };
  };

  const expectSame = (a: Awaited<ReturnType<typeof snapshot>>, b: Awaited<ReturnType<typeof snapshot>>) => {
    expect(b.ratings.length).toBe(a.ratings.length);
    expect(b.history.length).toBe(a.history.length);
    a.ratings.forEach((r, i) => {
      expect(b.ratings[i].user_id).toBe(r.user_id);
      expect(b.ratings[i].matches).toBe(r.matches);
      for (const k of ["rating", "rd", "volatility"]) expect(Number(b.ratings[i][k])).toBeCloseTo(Number(r[k]), 9);
    });
    a.history.forEach((h, i) => {
      expect(b.history[i].match_id).toBe(h.match_id);
      expect(Number(b.history[i].rating_after)).toBeCloseTo(Number(h.rating_after), 9);
    });
  };

  beforeAll(async () => {
    coach = await createUser(uniq("coach"));
    p = await Promise.all(["p1", "p2", "p3", "p4"].map(n => createUser(uniq(n))));
    clanId = await createClan({ admin: coach, members: p });
  });

  it("live updates equal a full replay, and the replay is idempotent", async () => {
    // Admin entry, player submission + opponent confirmation, bulk, doubles, and a tournament
    await call(updateMatch.POST, { uid: coach, body: { clanId, matchType: "singles", player1: p[0], player2: p[1], scoreDetails: { score: "21-15, 21-18" } } });
    const sub = await call(updateMatch.POST, { uid: p[2], body: { clanId, matchType: "singles", player1: p[2], player2: p[0], scoreDetails: { score: "21-19, 19-21, 21-17" } } });
    const conf = await call(confirm.POST, { uid: p[0], body: { submissionId: sub.json.submissionId, action: "confirm" } });
    expect(conf.json.ratingChanges).toHaveProperty(p[2]);
    expect((conf.json.ratingChanges as Record<string, number>)[p[2]]).toBeGreaterThan(0);

    await call(bulk.POST, { uid: coach, body: { clanId, matches: [
      { matchType: "singles", player1: p[1], player2: p[3], score: "21-10, 21-12" },
      { matchType: "doubles", team1Player1: p[0], team1Player2: p[1], team2Player1: p[2], team2Player2: p[3], score: "21-17, 21-19" },
      { matchType: "singles", player1: p[3], player2: p[0], score: "21-18, 22-20" },
    ] } });

    const t = await call(createTournament.POST, { uid: coach, body: {
      clanId, tournament_name: "Cup", tournament_type: "singles", format: "knockout", start_date: "2026-11-01",
      teams: [{ team_name: "A", players: JSON.stringify([p[0]]) }, { team_name: "B", players: JSON.stringify([p[2]]) }],
    } });
    const tournamentId = t.json.tournament_id;
    const [m] = await executeQuery(`SELECT match_id, team1_id FROM TournamentMatches WHERE tournament_id = ?`, [tournamentId]) as Record<string, number>[];
    const tm = await call(tournamentMatch.POST, { uid: coach, body: {
      tournamentId, matchId: m.match_id, winner_team_id: m.team1_id,
      score_details: "21-12, 21-14", team1_players: [p[0]], team2_players: [p[2]],
    } });
    expect(tm.status).toBe(200);
    expect(Object.keys(tm.json.ratingChanges as object).sort()).toEqual([p[0], p[2]].sort());
    const details = await call(tournamentDetails.GET, { uid: coach, method: "GET", query: { clanId, tournamentId: String(tournamentId) } });
    const shown = (details.json.matches as { match_id: number; rating_changes: Record<string, number> }[]).find(x => x.match_id === m.match_id)!;
    expect(shown.rating_changes[p[0]]).toBeGreaterThan(0);

    const live = await snapshot(p);
    expect(live.history.length).toBe(2 + 2 + 2 + 4 + 2 + 2);

    await recomputeRatings();
    const replayed = await snapshot(p);
    expectSame(live, replayed);

    await recomputeRatings();
    expectSame(live, await snapshot(p));
  });

  it("shows the rating change on match results", async () => {
    const res = await call(getMatches.GET, { uid: p[0], method: "GET", query: { id: String(clanId) } });
    const all = (res.json.data as { all: { ratingChanges: Record<string, number>; source: string }[] }).all;
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(Object.keys(m.ratingChanges).length).toBeGreaterThan(0);
    expect(all.some(m => Object.values(m.ratingChanges).some(d => d > 0))).toBe(true);
  });

  it("recomputes from history when confirmed results are deleted", async () => {
    const before = await snapshot(p);
    const series = await call(createSeries.POST, { uid: coach, body: { clanId, name: "S", type: "singles", Team1_players: [p[0]], Team2players: [p[1]] } });
    const seriesId = series.json.seriesId;
    await call(updateMatch.POST, { uid: coach, body: { clanId, matchType: "singles", player1: p[0], player2: p[1], series_id: seriesId, scoreDetails: { score: "21-5, 21-5" } } });
    expect((await snapshot(p)).history.length).toBe(before.history.length + 2);

    await call(deleteSeries.DELETE, { uid: coach, method: "DELETE", query: { seriesId: String(seriesId), clanId: String(clanId) } });
    expectSame(before, await snapshot(p));
  });

  it("leaderboard ranks rated players first, then provisional, and shows ratings", async () => {
    const coach2 = await createUser(uniq("coach"));
    const [a, b, c] = await Promise.all(["a", "b", "c"].map(n => createUser(uniq(n))));
    const clan2 = await createClan({ admin: coach2, members: [a, b, c] });
    // a and b play 10 matches (rated); c plays one and wins it (provisional, high rating)
    const matches = Array.from({ length: 10 }, (_, i) => ({
      matchType: "singles", player1: a, player2: b, score: i < 7 ? "21-15, 21-15" : "15-21, 15-21",
    }));
    await call(bulk.POST, { uid: coach2, body: { clanId: clan2, matches: [...matches, { matchType: "singles", player1: c, player2: b, score: "21-0, 21-0" }] } });

    const res = await call(leaderboard.GET, { uid: a, method: "GET", query: { clanId: String(clan2) } });
    const rows = res.json as unknown as { user_id: string; rank: number; rating: number; provisional: boolean; singles_rated_matches: number }[];
    const order = rows.map(r => r.user_id);
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(c));
    expect(order.indexOf(b)).toBeLessThan(order.indexOf(c));
    const rowC = rows.find(r => r.user_id === c)!;
    expect(rowC.provisional).toBe(true);
    expect(rowC.rating).toBeGreaterThan(rows.find(r => r.user_id === b)!.rating);
    expect(rows.find(r => r.user_id === a)!.provisional).toBe(false);
    expect(rows[0].rank).toBe(1);
  });
});
