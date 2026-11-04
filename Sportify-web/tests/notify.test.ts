import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { DAILY_CAP, notify, PushMessage, setPushSender } from "@/lib/notify";
import { call, createClan, createUser, uniq } from "./helpers";

import * as devices from "@/app/api/notifications/devices/route";
import * as preferences from "@/app/api/notifications/preferences/route";
import * as updateMatch from "@/app/api/clans/update_match/route";
import * as confirm from "@/app/api/clans/matches/confirm/route";
import * as sessionJoin from "@/app/api/game-sessions/[id]/join/route";
import * as session from "@/app/api/game-sessions/[id]/route";
import * as announcements from "@/app/api/organisations/announcements/route";
import * as invites from "@/app/api/invites/route";
import * as accept from "@/app/api/invites/[token]/accept/route";

// Recording sender: token -> messages. Tokens starting with "dead" are reported invalid.
let sent: { token: string; message: PushMessage }[] = [];
beforeAll(() => setPushSender(async (tokens, message) => {
  tokens.forEach(token => sent.push({ token, message }));
  return { delivered: tokens.filter(t => !t.startsWith("dead")), invalid: tokens.filter(t => t.startsWith("dead")) };
}));
afterAll(() => setPushSender(null));
beforeEach(() => { sent = []; });

const register = (uid: string, token = uniq(`tok_${uid}`)) =>
  call(devices.POST, { uid, body: { token, platform: "android" } }).then(() => token);
const typesFor = (token: string) => sent.filter(s => s.token === token).map(s => s.message.type);

describe("device tokens and preferences", () => {
  it("registers devices per user, moves a token on re-login, deletes only your own", async () => {
    const [a, b] = await Promise.all(["a", "b"].map(n => createUser(uniq(n))));
    const t1 = await register(a);
    await register(a); // second device
    expect((await executeQuery(`SELECT COUNT(*) AS n FROM DeviceTokens WHERE user_id = ?`, [a]) as { n: number }[])[0].n).toBe(2);

    await register(b, t1); // b signs in on a's phone
    const [row] = await executeQuery(`SELECT user_id FROM DeviceTokens WHERE token = ?`, [t1]) as { user_id: string }[];
    expect(row.user_id).toBe(b);

    await call(devices.DELETE, { uid: a, method: "DELETE", body: { token: t1 } });
    expect((await executeQuery(`SELECT 1 FROM DeviceTokens WHERE token = ?`, [t1]) as unknown[]).length).toBe(1);
    await call(devices.DELETE, { uid: b, method: "DELETE", body: { token: t1 } });
    expect((await executeQuery(`SELECT 1 FROM DeviceTokens WHERE token = ?`, [t1]) as unknown[]).length).toBe(0);
  });

  it("drops tokens FCM reports as invalid", async () => {
    const u = await createUser(uniq("u"));
    const good = await register(u);
    const dead = await register(u, uniq("dead"));
    await notify(u, "result_confirmed", { title: "t", body: "b", route: "/" });
    expect(typesFor(good)).toEqual(["result_confirmed"]);
    expect((await executeQuery(`SELECT token FROM DeviceTokens WHERE user_id = ?`, [u]) as { token: string }[]).map(r => r.token)).toEqual([good]);
    expect(dead).toMatch(/^dead/);
  });

  it("per-category opt-out", async () => {
    const u = await createUser(uniq("u"));
    const tok = await register(u);
    const before = await call(preferences.GET, { uid: u, method: "GET" });
    expect(before.json.preferences).toEqual({ results: true, sessions: true, announcements: true, invites: true });
    expect((await call(preferences.PUT, { uid: u, method: "PUT", body: { nonsense: false } })).status).toBe(400);
    const after = await call(preferences.PUT, { uid: u, method: "PUT", body: { announcements: false } });
    expect(after.json.preferences).toMatchObject({ announcements: false, results: true });

    await notify(u, "announcement", { title: "t", body: "b", route: "/" });
    await notify(u, "result_confirmed", { title: "t", body: "b", route: "/" });
    expect(typesFor(tok)).toEqual(["result_confirmed"]);
  });

  it(`caps non-transactional pushes at ${DAILY_CAP} a day; transactional ones still go out`, async () => {
    const u = await createUser(uniq("u"));
    const tok = await register(u);
    for (let i = 0; i < DAILY_CAP + 2; i++) await notify(u, "session_player_joined", { title: "t", body: "b", route: "/" });
    await notify(u, "result_needs_confirmation", { title: "t", body: "b", route: "/" });
    const types = typesFor(tok);
    expect(types.filter(t => t === "session_player_joined")).toHaveLength(DAILY_CAP);
    expect(types).toContain("result_needs_confirmation");
  });
});

describe("triggers", () => {
  let admin: string, p1: string, p2: string, clanId: number;
  let tAdmin: string, t1: string, t2: string;

  beforeAll(async () => {
    [admin, p1, p2] = await Promise.all(["admin", "p1", "p2"].map(n => createUser(uniq(n))));
    clanId = await createClan({ admin, members: [p1, p2] });
    [tAdmin, t1, t2] = await Promise.all([register(admin), register(p1), register(p2)]);
  });

  const submit = (uid: string) => call(updateMatch.POST, {
    uid, body: { matchType: "singles", clanId, player1: p1, player2: p2, scoreDetails: { score: "21-10, 21-12" } },
  });

  it("result submitted → opponent asked to confirm; confirmed → submitter told", async () => {
    const { submissionId } = (await submit(p1)).json;
    expect(typesFor(t2)).toEqual(["result_needs_confirmation"]);
    expect(sent.find(s => s.token === t2)!.message.route).toBe(`/clans/${clanId}`);
    expect(typesFor(t1)).toEqual([]);

    sent = [];
    await call(confirm.POST, { uid: p2, body: { submissionId, action: "confirm" } });
    expect(typesFor(t1)).toEqual(["result_confirmed"]);
    expect(typesFor(t2)).toEqual([]);
  });

  it("result disputed → submitter told", async () => {
    const { submissionId } = (await submit(p1)).json;
    sent = [];
    await call(confirm.POST, { uid: p2, body: { submissionId, action: "reject" } });
    expect(typesFor(t1)).toEqual(["result_disputed"]);
  });

  it("admin-entered result → both players told it's confirmed", async () => {
    await submit(admin);
    expect(typesFor(t1)).toEqual(["result_confirmed"]);
    expect(typesFor(t2)).toEqual(["result_confirmed"]);
    expect(typesFor(tAdmin)).toEqual([]);
  });

  it("session joined → host told; cancelled → players told", async () => {
    const s = await executeQuery(
      `INSERT INTO GameSessions (host_user_id, title, location, scheduled_at, max_players) VALUES (?, 'Evening', 'Court', NOW() + INTERVAL 1 DAY, 4)`,
      [admin]
    ) as { insertId: number };
    const id = String(s.insertId);
    await call(sessionJoin.POST, { uid: p1, params: { id }, body: { userName: "p1" } });
    expect(typesFor(tAdmin)).toEqual(["session_player_joined"]);

    sent = [];
    await call(session.PATCH, { uid: p1, method: "PATCH", params: { id }, body: { status: "cancelled" } }); // not the host: no-op
    expect(sent).toEqual([]);
    await call(session.PATCH, { uid: admin, method: "PATCH", params: { id }, body: { status: "cancelled" } });
    expect(typesFor(t1)).toEqual(["session_cancelled"]);
    expect(typesFor(tAdmin)).toEqual([]);
  });

  it("batch announcement → members told, not the author", async () => {
    const [coach, student] = await Promise.all(["coach", "student"].map(n => createUser(uniq(n))));
    const batchId = await createClan({ admin: coach, members: [student], type: "batch" });
    const [tc, ts] = await Promise.all([register(coach), register(student)]);
    await call(announcements.POST, { uid: coach, body: { batchId, title: "No class Sunday", body: "Rain" } });
    expect(typesFor(ts)).toEqual(["announcement"]);
    expect(sent.find(s => s.token === ts)!.message.body).toBe("No class Sunday");
    expect(typesFor(tc)).toEqual([]);
  });

  it("invite accepted → whoever shared the link told", async () => {
    const { token } = (await call(invites.POST, { uid: admin, body: { type: "clan", id: clanId } })).json as { token: string };
    const newbie = await createUser(uniq("newbie"));
    await call(accept.POST, { uid: newbie, params: { token } });
    expect(typesFor(tAdmin)).toEqual(["invite_accepted"]);
  });
});
