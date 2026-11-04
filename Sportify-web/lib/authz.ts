import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";

/**
 * Membership / role checks shared by every mutating API route.
 *
 * Authentication (who is calling) is lib/auth.ts. This module answers
 * "may this uid act on this clan / tournament / organisation?". Each check
 * reads the database, never trusts role flags sent by the client, and is a
 * plain boolean predicate so routes stay readable:
 *
 *   if (!(await isClanAdmin(uid, clanId))) return forbidden();
 *
 * Roles:
 *   - clan member:   any row in ClanMembers for the clan
 *   - clan admin:    ClanMembers.role in Admin / Coach / Owner, or the owner
 *                    of the organisation a batch belongs to
 *   - tournament manager: clan admin of the tournament's clan, or its creator
 *   - org owner:     Organisations.owner_user_id
 *   - org staff:     org owner, or clan admin of any batch in the org
 */

export const CLAN_ADMIN_ROLES = ["Admin", "Coach", "Owner"];

/** Returns a 403 NextResponse. Use as: return forbidden(); */
export function forbidden(message = "You do not have permission to do that") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export async function getClanRole(uid: string, clanId: unknown): Promise<string | null> {
  const rows = await executeQuery(
    `SELECT role FROM ClanMembers WHERE user_id = ? AND clan_id = ?`,
    [uid, clanId]
  ) as RowDataPacket[];
  return rows[0]?.role ?? null;
}

export async function isClanMember(uid: string, clanId: unknown): Promise<boolean> {
  return (await getClanRole(uid, clanId)) !== null;
}

/** True if every uid in the list is a member of the clan. */
export async function areClanMembers(clanId: unknown, uids: string[]): Promise<boolean> {
  const unique = [...new Set(uids)];
  if (!unique.length) return false;
  const rows = await executeQuery(
    `SELECT COUNT(*) AS cnt FROM ClanMembers WHERE clan_id = ? AND user_id IN (${unique.map(() => "?").join(",")})`,
    [clanId, ...unique]
  ) as RowDataPacket[];
  return Number(rows[0]?.cnt) === unique.length;
}

export async function isClanAdmin(uid: string, clanId: unknown): Promise<boolean> {
  const role = await getClanRole(uid, clanId);
  if (role && CLAN_ADMIN_ROLES.includes(role)) return true;
  // The owner of an academy manages all of its batches
  const rows = await executeQuery(
    `SELECT 1 FROM Clans c JOIN Organisations o ON o.org_id = c.org_id
     WHERE c.clan_id = ? AND o.owner_user_id = ?`,
    [clanId, uid]
  ) as RowDataPacket[];
  return rows.length > 0;
}

export async function isOrgOwner(uid: string, orgId: unknown): Promise<boolean> {
  const rows = await executeQuery(
    `SELECT 1 FROM Organisations WHERE org_id = ? AND owner_user_id = ?`,
    [orgId, uid]
  ) as RowDataPacket[];
  return rows.length > 0;
}

/** Org owner, or a coach/admin of any batch in the organisation. */
export async function isOrgStaff(uid: string, orgId: unknown): Promise<boolean> {
  if (await isOrgOwner(uid, orgId)) return true;
  const rows = await executeQuery(
    `SELECT 1 FROM ClanMembers cm JOIN Clans c ON c.clan_id = cm.clan_id
     WHERE c.org_id = ? AND cm.user_id = ? AND cm.role IN (${CLAN_ADMIN_ROLES.map(() => "?").join(",")})
     LIMIT 1`,
    [orgId, uid, ...CLAN_ADMIN_ROLES]
  ) as RowDataPacket[];
  return rows.length > 0;
}

/** True if the user belongs to the organisation in any capacity. */
export async function isOrgMember(uid: string, orgId: unknown): Promise<boolean> {
  if (await isOrgOwner(uid, orgId)) return true;
  const rows = await executeQuery(
    `SELECT 1 FROM ClanMembers cm JOIN Clans c ON c.clan_id = cm.clan_id
     WHERE c.org_id = ? AND cm.user_id = ? LIMIT 1`,
    [orgId, uid]
  ) as RowDataPacket[];
  return rows.length > 0;
}

/**
 * Loads a tournament the user may manage (clan admin of its clan, or the user
 * who created it). Returns null if it doesn't exist or the user may not manage
 * it. Routes should use the returned clan_id rather than one from the request.
 */
export async function getManagedTournament(
  uid: string,
  tournamentId: unknown
): Promise<{ tournament_id: number; clan_id: number; format: string; tournament_type: string } | null> {
  const rows = await executeQuery(
    `SELECT tournament_id, clan_id, format, tournament_type, created_by FROM Tournaments WHERE tournament_id = ?`,
    [tournamentId]
  ) as RowDataPacket[];
  const t = rows[0];
  if (!t) return null;
  if (t.created_by === uid || (await isClanAdmin(uid, t.clan_id))) {
    return { tournament_id: t.tournament_id, clan_id: t.clan_id, format: t.format, tournament_type: t.tournament_type };
  }
  return null;
}
