import { beforeAll, describe, expect, it } from "vitest";
import { executeQuery } from "@/lib/db";
import { call, createClan, createUser, uniq } from "./helpers";

import * as invites from "@/app/api/invites/route";
import * as invite from "@/app/api/invites/[token]/route";
import * as accept from "@/app/api/invites/[token]/accept/route";
import * as generateInvite from "@/app/api/organisations/generate_invite/route";

const create = (uid: string | null, body: Record<string, unknown>) => call(invites.POST, { uid, body });
const preview = (token: string, uid: string | null = null) => call(invite.GET, { uid, method: "GET", params: { token } });
const revoke = (uid: string, token: string) => call(invite.DELETE, { uid, method: "DELETE", params: { token } });
const join = (uid: string, token: string) => call(accept.POST, { uid, params: { token } });

const isMember = async (clanId: number, uid: string) =>
  ((await executeQuery(`SELECT 1 FROM ClanMembers WHERE clan_id = ? AND user_id = ?`, [clanId, uid])) as unknown[]).length > 0;

describe("invite links", () => {
  let admin: string, member: string, outsider: string, owner: string, coach: string, student: string, host: string;
  let clanId: number, orgId: number, batchId: number, sessionId: number;

  beforeAll(async () => {
    [admin, member, outsider, owner, coach, student, host] = await Promise.all(
      ["admin", "member", "outsider", "owner", "coach", "student", "host"].map(n => createUser(uniq(n)))
    );
    clanId = await createClan({ admin, members: [member] });
    const org = await executeQuery(`INSERT INTO Organisations (name, owner_user_id) VALUES (?, ?)`, [uniq("org"), owner]) as { insertId: number };
    orgId = org.insertId;
    batchId = await createClan({ admin: coach, members: [student], type: "batch", orgId });
    await executeQuery(`UPDATE Clans SET invite_code = ? WHERE clan_id = ?`, [uniq("C").slice(-12).toUpperCase(), batchId]);
    const s = await executeQuery(
      `INSERT INTO GameSessions (host_user_id, title, location, scheduled_at, max_players) VALUES (?, 'Doubles', 'Court 1', NOW() + INTERVAL 1 DAY, 3)`,
      [host]
    ) as { insertId: number };
    sessionId = s.insertId;
    await executeQuery(`INSERT INTO GameSessionPlayers (session_id, user_id) VALUES (?, ?)`, [sessionId, host]);
  });

  it("clan: only admins create; the URL is opaque; members join in one tap", async () => {
    expect((await create(member, { type: "clan", id: clanId })).status).toBe(403);
    expect((await create(outsider, { type: "clan", id: clanId })).status).toBe(403);
    expect((await create(admin, { type: "batch", id: clanId })).status).toBe(400); // it's not a batch

    const made = await create(admin, { type: "clan", id: clanId });
    expect(made.status).toBe(201);
    const { token, url } = made.json as { token: string; url: string };
    expect(url).toMatch(/\/i\/[A-Za-z0-9_-]{24}$/);
    expect(url).not.toContain(String(clanId));

    // Asking again returns the same link
    expect((await create(admin, { type: "clan", id: clanId })).json.token).toBe(token);

    const p = await preview(token);
    expect(p.status).toBe(200);
    expect(p.json).toMatchObject({ type: "clan", status: "active", alreadyMember: null, target: { memberCount: 2 } });
    expect(JSON.stringify(p.json)).not.toContain(`"${clanId}"`);

    expect((await call(accept.POST, { uid: null, params: { token } })).status).toBe(401);
    const joined = await join(outsider, token);
    expect(joined.status).toBe(200);
    expect(joined.json).toMatchObject({ alreadyMember: false, clanId, appRoute: `/clans/${clanId}` });
    expect(await isMember(clanId, outsider)).toBe(true);
    // Tapping it again is harmless
    expect((await join(outsider, token)).json).toMatchObject({ success: true, alreadyMember: true });
    expect((await preview(token, outsider)).json.alreadyMember).toBe(true);
  });

  it("clan: only admins revoke; revoked and rotated links stop working", async () => {
    const { token } = (await create(admin, { type: "clan", id: clanId })).json as { token: string };
    expect((await revoke(member, token)).status).toBe(403);
    expect((await revoke(outsider, token)).status).toBe(403);
    expect((await revoke(admin, token)).status).toBe(200);
    const late = await createUser(uniq("late"));
    expect((await join(late, token)).status).toBe(410);
    expect((await preview(token)).json.status).toBe("revoked");

    const a = (await create(admin, { type: "clan", id: clanId })).json.token as string;
    expect(a).not.toBe(token);
    const b = (await create(admin, { type: "clan", id: clanId, rotate: true })).json.token as string;
    expect(b).not.toBe(a);
    expect((await join(late, a)).status).toBe(410);
    expect((await join(late, b)).status).toBe(200);
  });

  it("expired links stop working", async () => {
    const { token } = (await create(admin, { type: "clan", id: clanId, rotate: true, expiresInDays: 1 })).json as { token: string };
    await executeQuery(`UPDATE InviteLinks SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE token = ?`, [token]);
    expect((await preview(token)).json.status).toBe("expired");
    expect((await join(await createUser(uniq("x")), token)).status).toBe(410);
    expect((await create(admin, { type: "clan", id: clanId, expiresInDays: 0 })).status).toBe(400);
  });

  it("batch: coach and academy owner create, students and outsiders can't; tied to the invite code", async () => {
    expect((await create(student, { type: "batch", id: batchId })).status).toBe(403);
    expect((await create(outsider, { type: "batch", id: batchId })).status).toBe(403);
    expect((await create(coach, { type: "clan", id: batchId })).status).toBe(400); // a batch link must say batch
    const { token } = (await create(owner, { type: "batch", id: batchId })).json as { token: string };
    expect((await create(coach, { type: "batch", id: batchId })).json.token).toBe(token);

    const newbie = await createUser(uniq("newbie"));
    const joined = await join(newbie, token);
    expect(joined.status).toBe(200);
    expect(joined.json).toMatchObject({ type: "batch", clanId: batchId });
    expect(await isMember(batchId, newbie)).toBe(true);
    expect((await preview(token)).json.target).toMatchObject({ orgName: expect.any(String) });

    // Regenerating the invite code turns old links off
    await call(generateInvite.POST, { uid: coach, body: { batchId } });
    expect((await preview(token)).json.status).toBe("revoked");
    expect((await join(await createUser(uniq("n2")), token)).status).toBe(410);
    // ...and a fresh link uses the new code
    const fresh = (await create(coach, { type: "batch", id: batchId })).json.token as string;
    expect(fresh).not.toBe(token);
    expect((await join(await createUser(uniq("n3")), fresh)).status).toBe(200);
  });

  it("session: only the host creates/revokes; joining follows the session rules", async () => {
    expect((await create(outsider, { type: "session", id: sessionId })).status).toBe(403);
    const { token } = (await create(host, { type: "session", id: sessionId })).json as { token: string };
    expect((await revoke(outsider, token)).status).toBe(403);

    expect((await preview(token)).json.target).toMatchObject({ name: "Doubles", joinedCount: 1, maxPlayers: 3 });
    const [p1, p2, p3] = await Promise.all(["p1", "p2", "p3"].map(n => createUser(uniq(n))));
    expect((await join(p1, token)).json).toMatchObject({ type: "session", sessionId, appRoute: `/find/${sessionId}` });
    expect((await join(p2, token)).status).toBe(200);
    const full = await join(p3, token); // max_players = 3
    expect(full.status).toBe(400);
    expect(full.json.error).toBe("Session is full");

    await executeQuery(`UPDATE GameSessions SET status = 'cancelled' WHERE session_id = ?`, [sessionId]);
    expect((await create(host, { type: "session", id: sessionId, rotate: true })).status).toBe(400);
  });

  it("unknown or malformed tokens are 404", async () => {
    expect((await preview("nope")).status).toBe(404);
    expect((await preview("A".repeat(24))).status).toBe(404);
    expect((await join(admin, "A".repeat(24))).status).toBe(404);
  });
});
