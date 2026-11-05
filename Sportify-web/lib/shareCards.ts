import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { isClanAdmin, isClanMember } from "@/lib/authz";
import { inviteStatus, InviteLink, newToken } from "@/lib/invites";
import { parseGames } from "@/lib/scoring";
import {
  DOUBLES_SELECT, fromDoublesRow, fromSinglesRow, fromTournamentRow, loadRatingChanges, MatchSource,
  SINGLES_SELECT, TOURNAMENT_SELECT,
} from "@/lib/ratings";
import { loadProgress } from "@/lib/progress";

/**
 * Shareable rank cards: https://<app>/s/<token>.
 *
 *   match   — a confirmed result: players, score, rating changes
 *   profile — a player's rating, rank in a clan, streak and latest badge
 *
 * The token is the only thing in the URL. Cards show public display names
 * only (never email or phone) and are rendered live by /api/og/<token>.
 * The landing page's "Join Sportify" button uses an active invite link to
 * the card's clan / batch when there is one (a clan admin sharing a card
 * creates one), and plain sign-up otherwise.
 */

export type CardKind = "match" | "profile";
const SOURCES: MatchSource[] = ["clan_singles", "clan_doubles", "tournament"];

export function shareUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://sportifyweb.netlify.app").replace(/\/$/, "");
  return `${base}/s/${token}`;
}

const isToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t);

/** The clan a match belongs to, or null if there's no such confirmed match. */
async function matchClan(source: MatchSource, matchId: number): Promise<number | null> {
  const sql = source === "clan_singles"
    ? `SELECT clan_id FROM InternalSinglesMatches WHERE match_id = ?`
    : source === "clan_doubles"
    ? `SELECT clan_id FROM InternalDoublesMatches WHERE match_id = ?`
    : `SELECT t.clan_id FROM TournamentMatches tm JOIN Tournaments t ON t.tournament_id = tm.tournament_id
       WHERE tm.match_id = ? AND tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'`;
  const [row] = await executeQuery(sql, [matchId]) as RowDataPacket[];
  return row ? Number(row.clan_id) : null;
}

/**
 * Creates (or reuses) a share card. Anyone in the match's clan can share a
 * match; a player can only share their own profile. Returns an error string
 * with an HTTP status on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createShareCard(uid: string, body: any): Promise<{ token: string } | { error: string; status: number }> {
  let source: MatchSource | null = null;
  let matchId: number | null = null;
  let userId: string | null = null;
  let clanId: number | null = null;

  if (body?.kind === "match") {
    source = body.source;
    matchId = Number(body.matchId);
    if (!SOURCES.includes(source!) || !Number.isInteger(matchId)) return { error: "source and matchId are required", status: 400 };
    clanId = await matchClan(source!, matchId);
    if (clanId === null) return { error: "Match not found", status: 404 };
    if (!(await isClanMember(uid, clanId)) && !(await isClanAdmin(uid, clanId))) {
      return { error: "Only members can share this match", status: 403 };
    }
  } else if (body?.kind === "profile") {
    userId = uid;
    if (body.clanId != null) {
      clanId = Number(body.clanId);
      if (!(await isClanMember(uid, clanId))) return { error: "You are not in that clan", status: 403 };
    }
  } else {
    return { error: "kind must be match or profile", status: 400 };
  }

  if (clanId !== null && (await isClanAdmin(uid, clanId)) && !(await activeInvite(clanId))) {
    await createClanInvite(uid, clanId);
  }

  const [existing] = await executeQuery(
    `SELECT token FROM ShareCards WHERE kind = ? AND match_source <=> ? AND match_id <=> ? AND user_id <=> ?
       AND clan_id <=> ? AND created_by = ? LIMIT 1`,
    [body.kind, source, matchId, userId, clanId, uid]
  ) as RowDataPacket[];
  if (existing) return { token: existing.token };

  const token = newToken();
  await executeQuery(
    `INSERT INTO ShareCards (token, kind, match_source, match_id, user_id, clan_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [token, body.kind, source, matchId, userId, clanId, uid]
  );
  return { token };
}

/** An invite link to the clan / batch that still works, if any. */
export async function activeInvite(clanId: number): Promise<string | null> {
  const links = await executeQuery(
    `SELECT * FROM InviteLinks WHERE target_type IN ('clan', 'batch') AND target_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 5`,
    [clanId]
  ) as RowDataPacket[];
  for (const l of links) {
    if ((await inviteStatus(l as InviteLink)) === "active") return l.token as string;
  }
  return null;
}

async function createClanInvite(uid: string, clanId: number) {
  const [c] = await executeQuery(`SELECT type, invite_code FROM Clans WHERE clan_id = ?`, [clanId]) as RowDataPacket[];
  if (!c) return;
  const batch = c.type === "batch";
  if (batch && !c.invite_code) return; // the coach hasn't generated a batch code yet
  await executeQuery(
    `INSERT INTO InviteLinks (token, target_type, target_id, invite_code, created_by) VALUES (?, ?, ?, ?, ?)`,
    [newToken(), batch ? "batch" : "clan", clanId, batch ? c.invite_code : null, uid]
  );
}

export interface MatchCard {
  kind: "match";
  clanName: string;
  format: "singles" | "doubles";
  team1: { name: string; change: number | null }[];
  team2: { name: string; change: number | null }[];
  games: [number, number][];
  winner: "team1" | "team2" | null;
  playedAt: string;
}

export interface ProfileCard {
  kind: "profile";
  name: string;
  rating: number;
  provisional: boolean;
  format: "singles" | "doubles";
  clanName: string | null;
  clanRank: number | null;
  clanMembers: number | null;
  streak: number;
  bestStreak: number;
  badge: { label: string; clanName: string | null; seasonName: string } | null;
}

export type Card = (MatchCard | ProfileCard) & { inviteToken: string | null };

const firstName = (n: unknown) => (typeof n === "string" && n.trim() ? n.trim() : "Player");

async function names(uids: string[]) {
  if (!uids.length) return new Map<string, string>();
  const rows = await executeQuery(
    `SELECT user_id, name FROM Users WHERE user_id IN (${uids.map(() => "?").join(",")})`, uids
  ) as RowDataPacket[];
  return new Map(rows.map(r => [r.user_id as string, firstName(r.name)]));
}

export async function loadCard(token: unknown): Promise<Card | null> {
  if (!isToken(token)) return null;
  const [card] = await executeQuery(`SELECT * FROM ShareCards WHERE token = ?`, [token]) as RowDataPacket[];
  if (!card) return null;
  const inviteToken = card.clan_id != null ? await activeInvite(Number(card.clan_id)) : null;
  const [clan] = card.clan_id != null
    ? await executeQuery(`SELECT name FROM Clans WHERE clan_id = ?`, [card.clan_id]) as RowDataPacket[]
    : [];

  if (card.kind === "match") {
    const row = await loadMatchRow(card.match_source, card.match_id);
    if (!row) return null;
    const changes = (await loadRatingChanges(card.match_source, [Number(card.match_id)])).get(Number(card.match_id)) ?? {};
    const n = await names([...row.team1, ...row.team2]);
    const side = (uids: string[]) => uids.map(u => ({ name: n.get(u) ?? "Player", change: changes[u] ?? null }));
    return {
      kind: "match", inviteToken,
      clanName: clan?.name ?? "Sportify",
      format: row.format,
      team1: side(row.team1),
      team2: side(row.team2),
      games: parseGames(row.score),
      winner: row.winner,
      playedAt: new Date(row.playedAt).toISOString(),
    };
  }

  const p = await loadProgress(card.user_id, new Date(), { closeSeasons: false });
  if (!p) return null;
  const inClan = p.clans.find(c => c.clanId === Number(card.clan_id)) ?? p.clans[0] ?? null;
  const badge = p.badges[0] ?? null;
  return {
    kind: "profile", inviteToken,
    name: p.name,
    rating: p.ratings[p.format].rating,
    provisional: p.ratings[p.format].provisional,
    format: p.format,
    clanName: inClan?.name ?? null,
    clanRank: inClan?.ratingRank ?? null,
    clanMembers: inClan?.members ?? null,
    streak: p.streak.current,
    bestStreak: p.streak.best,
    badge: badge ? { label: badge.label, clanName: badge.clanName, seasonName: badge.seasonName } : null,
  };
}

async function loadMatchRow(source: MatchSource, matchId: number) {
  const [r] = await executeQuery(
    source === "clan_singles" ? `${SINGLES_SELECT} WHERE match_id = ?`
      : source === "clan_doubles" ? `${DOUBLES_SELECT} WHERE match_id = ?`
      : `${TOURNAMENT_SELECT} AND tm.match_id = ?`,
    [matchId]
  ) as RowDataPacket[];
  if (!r) return null;
  const m = source === "clan_singles" ? fromSinglesRow(r) : source === "clan_doubles" ? fromDoublesRow(r) : fromTournamentRow(r);
  return { ...m, score: m.score ?? "" };
}
