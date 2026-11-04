import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { call, createClan, createUser, uniq } from "./helpers";

import * as createSeries from "@/app/api/clans/series/create_series/route";
import * as deleteSeries from "@/app/api/clans/series/delete_series/route";
import * as finishSeries from "@/app/api/clans/series/finish_series/route";
import * as createTournament from "@/app/api/clans/tournaments/create_tournament/route";
import * as hostTournament from "@/app/api/clans/tournaments/host_tournament/route";
import * as deleteTournament from "@/app/api/clans/tournaments/delete_tournament/route";
import * as tournamentMatch from "@/app/api/clans/tournaments/update_match/route";
import * as completeTournament from "@/app/api/clans/tournaments/complete_tournament/route";
import * as startHosted from "@/app/api/clans/tournaments/start_hosted/route";
import * as register from "@/app/api/clans/tournaments/register/route";
import * as joinClan from "@/app/api/clans/join_clan/route";
import * as attendance from "@/app/api/organisations/attendance/route";
import * as announcements from "@/app/api/organisations/announcements/route";
import * as orgAnnouncements from "@/app/api/organisations/org_announcements/route";
import * as sessions from "@/app/api/organisations/sessions/route";
import * as orgSessions from "@/app/api/organisations/org_sessions/route";
import * as generateInvite from "@/app/api/organisations/generate_invite/route";
import * as studentStats from "@/app/api/organisations/student-stats/route";

const API_DIR = path.join(__dirname, "..", "app", "api");
const routeFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? routeFiles(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []);

describe("every mutating route requires a signed-in user", () => {
  const cases = routeFiles(API_DIR).flatMap(file => {
    const src = fs.readFileSync(file, "utf8");
    return ["POST", "PUT", "PATCH", "DELETE"]
      .filter(m => new RegExp(`export async function ${m}\\b`).test(src))
      .map(m => [path.relative(API_DIR, path.dirname(file)), m] as const);
  });

  it("found the routes", () => expect(cases.length).toBeGreaterThan(30));

  it.each(cases)("%s %s → 401 without a token", async (route, method) => {
    const mod = await import(path.join(API_DIR, route, "route.ts"));
    const res = await call(mod[method], { uid: null, method, params: { id: "1" } });
    expect(res.status).toBe(401);
  });

  it("updateleaderboard (unauthenticated-by-role leaderboard writes) is gone", () => {
    expect(fs.existsSync(path.join(API_DIR, "clans", "updateleaderboard"))).toBe(false);
  });
});

describe("role checks", () => {
  let admin: string, member: string, outsider: string, clanId: number;
  let owner: string, coach: string, student: string, orgId: number, batchId: number;

  beforeAll(async () => {
    [admin, member, outsider, owner, coach, student] = await Promise.all(
      ["admin", "member", "outsider", "owner", "coach", "student"].map(n => createUser(uniq(n)))
    );
    clanId = await createClan({ admin, members: [member] });
    const org = await executeQuery(`INSERT INTO Organisations (name, owner_user_id) VALUES (?, ?)`, [uniq("org"), owner]) as { insertId: number };
    orgId = org.insertId;
    batchId = await createClan({ admin: coach, members: [student], type: "batch", orgId });
  });

  const expectDenied = async (p: Promise<{ status: number }>) => expect((await p).status).toBe(403);
  const expectAllowed = async (p: Promise<{ status: number; json: Record<string, unknown> }>) => {
    const r = await p;
    expect(r.status, JSON.stringify(r.json)).toBeLessThan(300);
    return r.json;
  };

  it("series: only clan admins create, finish and delete", async () => {
    const body = { clanId, name: "S", type: "singles", Team1_players: [admin], Team2players: [member] };
    await expectDenied(call(createSeries.POST, { uid: member, body }));
    await expectDenied(call(createSeries.POST, { uid: outsider, body }));
    const { seriesId } = await expectAllowed(call(createSeries.POST, { uid: admin, body }));

    await expectDenied(call(finishSeries.POST, { uid: member, body: { clanId, seriesId } }));
    const q = { seriesId: String(seriesId), clanId: String(clanId) };
    await expectDenied(call(deleteSeries.DELETE, { uid: member, method: "DELETE", query: q }));
    await expectDenied(call(deleteSeries.DELETE, { uid: outsider, method: "DELETE", query: q }));
    await expectAllowed(call(deleteSeries.DELETE, { uid: admin, method: "DELETE", query: q }));
  });

  it("tournaments: only clan admins / the host manage them, and results count once", async () => {
    const body = {
      clanId, tournament_name: "T", tournament_type: "singles", format: "knockout", start_date: "2026-11-01",
      teams: [{ team_name: "A", players: JSON.stringify([admin]) }, { team_name: "B", players: JSON.stringify([member]) }],
    };
    await expectDenied(call(createTournament.POST, { uid: member, body }));
    const { tournament_id: tournamentId } = await expectAllowed(call(createTournament.POST, { uid: admin, body }));

    const [match] = await executeQuery(`SELECT match_id, team1_id FROM TournamentMatches WHERE tournament_id = ?`, [tournamentId]) as { match_id: number; team1_id: number }[];
    const result = { tournamentId, matchId: match.match_id, winner_team_id: match.team1_id, score_details: "21-10", team1_players: [admin], team2_players: [member] };
    await expectDenied(call(tournamentMatch.POST, { uid: member, body: result }));
    await expectDenied(call(tournamentMatch.POST, { uid: outsider, body: result }));
    await expectAllowed(call(tournamentMatch.POST, { uid: admin, body: result }));
    expect((await call(tournamentMatch.POST, { uid: admin, body: result })).status).toBe(409);

    await expectDenied(call(completeTournament.POST, { uid: member, body: { clanId, tournamentId } }));
    const q = { tournamentId: String(tournamentId), clanId: String(clanId) };
    await expectDenied(call(deleteTournament.DELETE, { uid: member, method: "DELETE", query: q }));
    await expectDenied(call(deleteTournament.DELETE, { uid: outsider, method: "DELETE", query: q }));
    // Claiming another clan's id doesn't help
    const otherClan = await createClan({ admin: outsider });
    await expectDenied(call(deleteTournament.DELETE, { uid: outsider, method: "DELETE", query: { ...q, clanId: String(otherClan) } }));
    await expectAllowed(call(deleteTournament.DELETE, { uid: admin, method: "DELETE", query: q }));
  });

  it("hosted tournaments: admins host and start, only clan members register", async () => {
    const body = { clanId, tournament_name: "H", tournament_type: "singles", format: "round_robin" };
    await expectDenied(call(hostTournament.POST, { uid: member, body }));
    const { tournament_id: tournamentId } = await expectAllowed(call(hostTournament.POST, { uid: admin, body }));
    await expectDenied(call(register.POST, { uid: outsider, body: { tournamentId, userName: "x", action: "join_player" } }));
    await expectAllowed(call(register.POST, { uid: member, body: { tournamentId, userName: "m", action: "join_player" } }));
    await expectAllowed(call(register.POST, { uid: admin, body: { tournamentId, userName: "a", action: "join_player" } }));
    await expectDenied(call(startHosted.POST, { uid: member, body: { tournamentId } }));
    await expectAllowed(call(startHosted.POST, { uid: admin, body: { tournamentId } }));
  });

  it("batches can't be joined without an invite code", async () => {
    await expectDenied(call(joinClan.POST, { uid: outsider, body: { clanId: batchId } }));
  });

  it("attendance: coaches and the org owner only", async () => {
    const body = { batchId, date: "2026-11-02", records: [{ userId: student, status: "present" }] };
    await expectDenied(call(attendance.POST, { uid: student, body }));
    await expectDenied(call(attendance.POST, { uid: outsider, body }));
    await expectAllowed(call(attendance.POST, { uid: coach, body }));
    await expectAllowed(call(attendance.POST, { uid: owner, body }));
    await expectDenied(call(attendance.GET, { uid: student, method: "GET", query: { batchId, date: "2026-11-02" } }));
    // Can't mark someone outside the batch
    expect((await call(attendance.POST, { uid: coach, body: { ...body, records: [{ userId: outsider, status: "present" }] } })).status).toBe(400);
  });

  it("batch announcements and sessions: coaches post/manage, members read", async () => {
    const body = { batchId, title: "t", body: "b" };
    await expectDenied(call(announcements.POST, { uid: student, body }));
    const { announcementId } = await expectAllowed(call(announcements.POST, { uid: coach, body }));
    await expectAllowed(call(announcements.GET, { uid: student, method: "GET", query: { batchId } }));
    await expectDenied(call(announcements.GET, { uid: outsider, method: "GET", query: { batchId } }));
    await expectDenied(call(announcements.PATCH, { uid: student, method: "PATCH", body: { announcementId, pinned: true } }));
    await expectDenied(call(announcements.DELETE, { uid: outsider, method: "DELETE", query: { announcementId: String(announcementId) } }));
    await expectAllowed(call(announcements.DELETE, { uid: owner, method: "DELETE", query: { announcementId: String(announcementId) } }));

    const s = { batchId, scheduledAt: "2026-11-03 18:00:00" };
    await expectDenied(call(sessions.POST, { uid: student, body: s }));
    const { sessionId } = await expectAllowed(call(sessions.POST, { uid: coach, body: s }));
    await expectDenied(call(sessions.DELETE, { uid: student, method: "DELETE", query: { sessionId: String(sessionId) } }));
    await expectAllowed(call(sessions.DELETE, { uid: coach, method: "DELETE", query: { sessionId: String(sessionId) } }));
  });

  it("org announcements and sessions: staff manage, members read, outsiders nothing", async () => {
    const body = { orgId, title: "t", body: "b" };
    await expectDenied(call(orgAnnouncements.POST, { uid: student, body }));
    const { announcementId } = await expectAllowed(call(orgAnnouncements.POST, { uid: coach, body }));
    await expectAllowed(call(orgAnnouncements.GET, { uid: student, method: "GET", query: { orgId } }));
    await expectDenied(call(orgAnnouncements.GET, { uid: outsider, method: "GET", query: { orgId } }));
    await expectDenied(call(orgAnnouncements.DELETE, { uid: student, method: "DELETE", query: { announcementId: String(announcementId) } }));

    const s = { orgId, scheduledAt: "2026-11-03 18:00:00" };
    await expectDenied(call(orgSessions.POST, { uid: student, body: s }));
    const { sessionId } = await expectAllowed(call(orgSessions.POST, { uid: owner, body: s }));
    await expectDenied(call(orgSessions.DELETE, { uid: outsider, method: "DELETE", query: { sessionId: String(sessionId) } }));
  });

  it("invite codes and student stats are staff-only", async () => {
    await expectDenied(call(generateInvite.POST, { uid: student, body: { batchId } }));
    await expectAllowed(call(generateInvite.POST, { uid: owner, body: { batchId } }));
    await expectDenied(call(studentStats.GET, { uid: outsider, method: "GET", query: { batchId, userId: student } }));
    await expectAllowed(call(studentStats.GET, { uid: student, method: "GET", query: { batchId } }));
    await expectAllowed(call(studentStats.GET, { uid: coach, method: "GET", query: { batchId, userId: student } }));
  });
});
