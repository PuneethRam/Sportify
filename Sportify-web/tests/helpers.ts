import { executeQuery } from "@/lib/db";

type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Calls a route handler the way Next would. `uid` null = no Authorization header. */
export async function call(
  handler: Handler,
  opts: { uid?: string | null; method?: string; body?: unknown; query?: Record<string, string | number>; params?: Record<string, string> } = {}
) {
  const url = new URL("http://test.local/api");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.uid) headers.Authorization = `Bearer uid:${opts.uid}`;
  const req = new Request(url, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : (opts.method ?? "POST") === "GET" || opts.method === "DELETE" ? undefined : "{}",
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

let seq = 0;
/** Unique-ish id so tests don't collide inside the shared test database. */
export const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

export async function createUser(id: string) {
  await executeQuery(`INSERT INTO Users (user_id, name, email) VALUES (?, ?, ?)`, [id, id, `${id}@test.local`]);
  return id;
}

/** Creates a clan with an admin and members, each with a leaderboard row. */
export async function createClan(opts: { admin: string; members?: string[]; type?: string; orgId?: number }) {
  const res = await executeQuery(
    `INSERT INTO Clans (name, clan_rank, type, org_id) VALUES (?, 0, ?, ?)`,
    [uniq("clan"), opts.type ?? null, opts.orgId ?? null]
  ) as { insertId: number };
  const clanId = res.insertId;
  const add = async (uid: string, role: string) => {
    await executeQuery(`INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, ?)`, [uid, clanId, role]);
    await executeQuery(`INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points) VALUES (?, ?, 0)`, [clanId, uid]);
  };
  await add(opts.admin, opts.type === "batch" ? "Coach" : "Admin");
  for (const m of opts.members ?? []) await add(m, "Member");
  return clanId;
}

export async function points(clanId: number, uid: string) {
  const [row] = await executeQuery(
    `SELECT clan_points, singles_points, doubles_points, matchesplayed, matcheswon, matcheslost
     FROM ClanLeaderboard WHERE clan_id = ? AND user_id = ?`,
    [clanId, uid]
  ) as Record<string, number>[];
  return row;
}
