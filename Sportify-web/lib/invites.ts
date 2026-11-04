import crypto from "node:crypto";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { isClanAdmin, isSessionHost } from "@/lib/authz";

/**
 * Shareable invite links: https://<app>/i/<token>.
 *
 * The token is random and opaque; the clan / batch / session it points at is
 * only in the InviteLinks table. Who may create or revoke a link:
 *   clan    — a clan admin
 *   batch   — the batch's coach, or the academy owner
 *   session — the session host
 * Accepting runs the normal join rules (lib/membership.ts). A batch link is
 * the batch's invite code in link form: it stops working when the code is
 * regenerated, and joining still goes through joinBatchByCode.
 */

export const INVITE_TYPES = ["clan", "batch", "session"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

export interface InviteLink {
  token: string;
  target_type: InviteType;
  target_id: number;
  invite_code: string | null;
  created_by: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  use_count: number;
}

export function newToken() {
  return crypto.randomBytes(18).toString("base64url"); // 24 URL-safe chars, 144 bits
}

export function inviteUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://sportifyweb.netlify.app").replace(/\/$/, "");
  return `${base}/i/${token}`;
}

export const isInviteType = (t: unknown): t is InviteType => INVITE_TYPES.includes(t as InviteType);

export async function canManageInvites(uid: string, type: InviteType, targetId: unknown) {
  return type === "session" ? isSessionHost(uid, targetId) : isClanAdmin(uid, targetId);
}

export async function getInvite(token: unknown): Promise<InviteLink | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await executeQuery(`SELECT * FROM InviteLinks WHERE token = ?`, [token]) as RowDataPacket[];
  return (row as InviteLink | undefined) ?? null;
}

/**
 * "active", or why the link no longer works. For batches this checks the
 * batch's current invite code, so it reads the database.
 */
export async function inviteStatus(link: InviteLink): Promise<"active" | "revoked" | "expired"> {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return "expired";
  if (link.target_type === "batch") {
    const [batch] = await executeQuery(
      `SELECT invite_code FROM Clans WHERE clan_id = ? AND type = 'batch'`,
      [link.target_id]
    ) as RowDataPacket[];
    if (!batch?.invite_code || batch.invite_code !== link.invite_code) return "revoked";
  }
  return "active";
}

/** What the link points at, for the landing page. No internal ids. */
export async function describeTarget(type: InviteType, targetId: number) {
  if (type === "session") {
    const [s] = await executeQuery(
      `SELECT gs.title, gs.sport, gs.location, gs.scheduled_at, gs.max_players, gs.status, gs.skill_level,
              gs.host_name, COUNT(gsp.id) AS joined_count
       FROM GameSessions gs LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
       WHERE gs.session_id = ? GROUP BY gs.session_id`,
      [targetId]
    ) as RowDataPacket[];
    if (!s) return null;
    return {
      name: s.title as string,
      sport: s.sport, location: s.location, scheduledAt: s.scheduled_at, skillLevel: s.skill_level,
      hostName: s.host_name, maxPlayers: s.max_players, joinedCount: Number(s.joined_count), sessionStatus: s.status,
    };
  }
  const [c] = await executeQuery(
    `SELECT c.name, c.type, o.name AS org_name, (SELECT COUNT(*) FROM ClanMembers cm WHERE cm.clan_id = c.clan_id) AS members
     FROM Clans c LEFT JOIN Organisations o ON o.org_id = c.org_id WHERE c.clan_id = ?`,
    [targetId]
  ) as RowDataPacket[];
  if (!c) return null;
  return { name: c.name as string, orgName: (c.org_name as string | null) ?? null, memberCount: Number(c.members) };
}

/** Is the user already in the clan / batch / session? */
export async function isAlreadyIn(uid: string, type: InviteType, targetId: number) {
  const rows = await executeQuery(
    type === "session"
      ? `SELECT 1 FROM GameSessionPlayers WHERE session_id = ? AND user_id = ?`
      : `SELECT 1 FROM ClanMembers WHERE clan_id = ? AND user_id = ?`,
    [targetId, uid]
  ) as RowDataPacket[];
  return rows.length > 0;
}

/** Where to go after joining: web path and mobile (go_router) route. */
export async function destination(type: InviteType, targetId: number) {
  if (type === "session") return { path: `/find-a-mate/${targetId}`, appRoute: `/find/${targetId}`, sessionId: targetId };
  return { path: `/clan/clandetails?clanId=${targetId}`, appRoute: `/clans/${targetId}`, clanId: targetId };
}
