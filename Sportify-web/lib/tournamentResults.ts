import type { Connection } from "mysql2/promise";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { parsePlayers } from "@/lib/metrics";
import { applyResult, Side } from "@/lib/scoring";
import { fromTournamentRow, TOURNAMENT_SELECT } from "@/lib/ratings";
import { playsIn, SubmissionConflict } from "@/lib/matchSubmissions";
import { displayName, notify } from "@/lib/notify";

/**
 * Tournament results follow the same rule as clan matches (lib/matchSubmissions.ts):
 *
 *   host / clan admin enters ─► confirmed               (they didn't play in it)
 *                          └──► pending ─► confirmed    (a player on the other side,
 *                                  │                      or a host/admin who didn't play)
 *                                  └────► disputed      (same people; the host can then
 *                                                        correct the score, or a host/admin
 *                                                        who didn't play can confirm it)
 *
 * The bracket never waits: the winner advances as soon as a result is entered,
 * pending or not. Only `result_status = 'confirmed'` results count towards
 * ratings, clan points, streaks, season standings, WAC and profile stats.
 *
 * "Played in the match" means on either team: the selected line-up plus the
 * team's roster, so a doubles partner (or a squad member sitting out) is on
 * the same side as the person entering the result.
 *
 * Corrections: a pending or disputed result can be re-entered by the host or
 * a clan admin, and the new result goes through the same rule. A confirmed
 * result is final. Corrections are blocked once the tournament is completed,
 * once the next knockout round has a result, or (for a group / round-robin
 * match) once the knockout stage has been drawn.
 */

export type ResultStatus = "pending" | "confirmed" | "disputed";

export interface TournamentResult {
  match_id: number;
  tournament_id: number;
  tournament_name: string;
  clan_id: number;
  format: string;
  tournament_status: string;
  team1_id: number | null;
  team2_id: number | null;
  winner_team_id: number | null;
  round_number: number;
  phase: string;
  team1_players: unknown;
  team2_players: unknown;
  roster1: unknown;
  roster2: unknown;
  result_status: ResultStatus;
  recorded_by: string | null;
}

const RESULT_SELECT =
  `SELECT tm.match_id, tm.tournament_id, t.tournament_name, t.clan_id, t.format, t.status AS tournament_status,
          tm.team1_id, tm.team2_id, tm.winner_team_id, tm.round_number, tm.phase,
          tm.team1_players, tm.team2_players, r1.players AS roster1, r2.players AS roster2,
          tm.result_status, tm.recorded_by
   FROM TournamentMatches tm
   JOIN Tournaments t ON t.tournament_id = tm.tournament_id
   LEFT JOIN TournamentTeams r1 ON r1.team_id = tm.team1_id
   LEFT JOIN TournamentTeams r2 ON r2.team_id = tm.team2_id`;

type Db = Pick<Connection, "execute">;

export async function loadTournamentResult(db: Db, tournamentId: unknown, matchId: unknown, forUpdate = false) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `${RESULT_SELECT} WHERE tm.match_id = ? AND tm.tournament_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [matchId, tournamentId]
  );
  return (rows[0] as TournamentResult | undefined) ?? null;
}

/** Everyone on each side: the selected line-up plus the team's roster. */
export function sidesOf(m: Pick<TournamentResult, "team1_players" | "team2_players" | "roster1" | "roster2">) {
  return {
    team1: [...new Set([...parsePlayers(m.team1_players), ...parsePlayers(m.roster1)])],
    team2: [...new Set([...parsePlayers(m.team2_players), ...parsePlayers(m.roster2)])],
  };
}

/** The side `uid` is on, or null if they aren't in the match. */
export function sideOf(m: TournamentResult, uid: string | null): Side | null {
  if (!uid) return null;
  const { team1, team2 } = sidesOf(m);
  if (team1.includes(uid)) return "team1";
  if (team2.includes(uid)) return "team2";
  return null;
}

/**
 * Who may confirm or dispute a result: a player on the other side from the
 * person who entered it while it is pending, or a host / clan admin who did
 * not play in it (pending or disputed). Nobody on the entering side, partner
 * included, can resolve it.
 */
export function canResolve(m: TournamentResult, uid: string, manages: boolean): boolean {
  if (m.winner_team_id == null || m.result_status === "confirmed") return false;
  if (manages && !playsIn(sidesOf(m), uid)) return true;
  if (m.result_status !== "pending") return false;
  const recorder = sideOf(m, m.recorded_by);
  const mine = sideOf(m, uid);
  return mine !== null && mine !== recorder;
}

/** Bracket match: the winner moves on to a next-round match. */
export const isBracketMatch = (m: Pick<TournamentResult, "format" | "phase">) =>
  m.format === "knockout" || m.phase === "knockout";

export type MatchLite = { round_number: number; phase: string; winner_team_id: number | null };

/**
 * Why an entered result can't be corrected, or null if it can. `all` is every
 * match in the tournament.
 */
export function correctionBlock(m: TournamentResult, all: MatchLite[]): string | null {
  if (m.winner_team_id == null) return null;
  if (m.result_status === "confirmed") return "This match already has a confirmed result";
  if (m.tournament_status === "completed") return "The tournament is completed";
  if (isBracketMatch(m)) {
    if (all.some(o => o.phase === "knockout" && o.round_number > m.round_number && o.winner_team_id != null)) {
      return "The next round already has a result";
    }
  } else if (all.some(o => o.phase === "knockout")) {
    return "The knockout stage has already been drawn";
  }
  return null;
}

/**
 * Counts a confirmed result: clan points and ratings, from the players stored
 * on the match. Call inside the transaction that confirmed it.
 */
export async function applyTournamentResult(db: Db, clanId: number, matchId: number) {
  const [[row]] = await db.execute<RowDataPacket[]>(`${TOURNAMENT_SELECT} AND tm.match_id = ?`, [matchId]);
  if (!row) return null;
  const rated = fromTournamentRow(row);
  if (!rated.team1.length || !rated.team2.length) return null;
  return applyResult(db, {
    clanId,
    format: rated.format,
    team1: rated.team1,
    team2: rated.team2,
    score: row.score_details ?? "",
    winner: rated.winner,
    match: { source: "tournament", matchId: rated.matchId, playedAt: rated.playedAt },
  });
}

/**
 * Confirms a pending or disputed result and counts it. Its time becomes the
 * confirmation time, so ratings replay in the order results were confirmed.
 * Throws SubmissionConflict if someone else confirmed it first.
 */
export async function confirmTournamentResult(db: Db, m: TournamentResult, resolverUid: string) {
  const [upd] = await db.execute<ResultSetHeader>(
    `UPDATE TournamentMatches
     SET result_status = 'confirmed', resolved_by = ?, resolved_at = NOW(), recorded_at = NOW()
     WHERE match_id = ? AND winner_team_id IS NOT NULL AND result_status IN ('pending', 'disputed')`,
    [resolverUid, m.match_id]
  );
  if (upd.affectedRows === 0) throw new SubmissionConflict("This result has already been confirmed");
  return applyTournamentResult(db, m.clan_id, m.match_id);
}

const route = (m: TournamentResult) => `/clans/${m.clan_id}/tournament/${m.tournament_id}`;

/** A result someone played in was entered: the other side has to confirm it. */
export async function notifyTournamentResultPending(m: TournamentResult) {
  const side = sideOf(m, m.recorded_by);
  const { team1, team2 } = sidesOf(m);
  const others = side === "team1" ? team2 : side === "team2" ? team1 : [...team1, ...team2];
  await notify(others.filter(p => p !== m.recorded_by), "result_needs_confirmation", {
    title: "Confirm your match result",
    body: `${await displayName(m.recorded_by ?? "")} recorded your result in ${m.tournament_name}. Tap to confirm or dispute.`,
    route: route(m),
  });
}

export async function notifyTournamentResultConfirmed(m: TournamentResult, resolverUid: string) {
  const { team1, team2 } = sidesOf(m);
  await notify([...team1, ...team2].filter(p => p !== resolverUid), "result_confirmed", {
    title: "Result confirmed",
    body: `Your result in ${m.tournament_name} is confirmed and on the leaderboard.`,
    route: route(m),
  });
}

/** Tell the person who entered it and their side; the host can correct it. */
export async function notifyTournamentResultDisputed(m: TournamentResult, resolverUid: string) {
  const side = sideOf(m, m.recorded_by);
  const team = side ? sidesOf(m)[side] : [];
  await notify([m.recorded_by, ...team].filter(p => p && p !== resolverUid), "result_disputed", {
    title: "Result disputed",
    body: `${await displayName(resolverUid)} disputed a result in ${m.tournament_name}. The host can correct the score.`,
    route: route(m),
  });
}

/** Every match in a tournament, for correctionBlock(). */
export async function loadTournamentMatches(db: Db, tournamentId: unknown): Promise<MatchLite[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT round_number, phase, winner_team_id FROM TournamentMatches WHERE tournament_id = ?`, [tournamentId]
  );
  return rows as MatchLite[];
}
