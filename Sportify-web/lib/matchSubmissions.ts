import type { Connection } from "mysql2/promise";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { applyResult, determineWinner, MatchFormat, parseGames, Side } from "@/lib/scoring";
import { isClanAdmin } from "@/lib/authz";
import { finalizeTournamentSubmission } from "@/lib/tournamentResults";

/**
 * Clan match results go through MatchSubmissions:
 *
 *   submit (player or admin) ─► pending ─► confirmed  (opponent or clan admin)
 *                                  └─────► disputed   (opponent rejects; a clan admin can still confirm)
 *
 * A result is confirmed on entry only when the person entering it is a clan
 * admin who did not play in it (a coach recording a class). Nobody confirms
 * their own result: an admin who played goes through the pending path like
 * any player, and only the other side or a different admin can confirm it.
 *
 * Only finalizeSubmission() writes the InternalSinglesMatches /
 * InternalDoublesMatches row and touches ClanLeaderboard, so every existing
 * stats query over those tables only ever sees confirmed results.
 *
 * Tournament results use the same rows (tournament_match_id set): the "clan
 * admins" are then the tournament host and clan admins, and confirming writes
 * the bracket match (lib/tournamentResults.ts) instead of a clan match.
 */

export interface Submission {
  submission_id: number;
  clan_id: number;
  match_type: MatchFormat;
  series_id: number | null;
  team1_player1: string;
  team1_player2: string | null;
  team2_player1: string;
  team2_player2: string | null;
  score_details: string;
  winner: Side | null;
  status: "pending" | "confirmed" | "disputed";
  submitted_by: string;
  /** Set for a tournament result: the TournamentMatches row it decides. */
  tournament_match_id: number | null;
}

export interface MatchEntry {
  matchType: MatchFormat;
  team1: string[];
  team2: string[];
  /** Stored as MatchSubmissions.score_details (JSON with at least `score`). */
  scoreDetails: { score: string } & Record<string, unknown>;
}

/**
 * Validates one result as sent by clients:
 *   { matchType: "singles", player1, player2, scoreDetails: { score } }
 *   { matchType: "doubles", team1Player1, team1Player2, team2Player1, team2Player2, scoreDetails: { score } }
 * `score` may also be given at the top level. Returns the entry or an error message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMatchEntry(data: any): MatchEntry | string {
  const matchType = data?.matchType;
  const scoreDetails = data?.scoreDetails && typeof data.scoreDetails === "object"
    ? data.scoreDetails
    : typeof data?.score === "string" ? { score: data.score } : null;
  if (!matchType || !scoreDetails) return "Missing required fields";
  const score = scoreDetails.score;
  if (typeof score !== "string" || !parseGames(score).length) return "Score is required, e.g. \"21-15, 21-18\"";

  let team1: string[];
  let team2: string[];
  if (matchType === "singles") {
    team1 = [data.player1];
    team2 = [data.player2];
  } else if (matchType === "doubles") {
    team1 = [data.team1Player1, data.team1Player2];
    team2 = [data.team2Player1, data.team2Player2];
  } else {
    return "Invalid match type";
  }
  const players = [...team1, ...team2];
  if (players.some(p => !p || typeof p !== "string")) return "Missing player information";
  if (new Set(players).size !== players.length) return "A player can only appear once in a match";
  return { matchType, team1, team2, scoreDetails };
}

/** Inserts a pending submission; returns its id. */
export async function insertSubmission(
  db: Pick<Connection, "execute">,
  clanId: unknown,
  e: MatchEntry,
  submittedBy: string,
  opts: {
    seriesId?: number | null;
    entryMethod?: "player" | "admin" | "bulk";
    /** A tournament result: the bracket match, and the winner the recorder picked. */
    tournament?: { matchId: number; winner: Side };
  } = {}
) {
  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO MatchSubmissions
     (clan_id, match_type, series_id, team1_player1, team1_player2, team2_player1, team2_player2,
      score_details, winner, submitted_by, entry_method, tournament_match_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [clanId, e.matchType, opts.seriesId ?? null, e.team1[0], e.team1[1] ?? null, e.team2[0], e.team2[1] ?? null,
     JSON.stringify(e.scoreDetails), opts.tournament?.winner ?? determineWinner(e.scoreDetails.score), submittedBy,
     opts.entryMethod ?? "player", opts.tournament?.matchId ?? null]
  );
  return ins.insertId;
}

export function teamsOf(s: Submission): { team1: string[]; team2: string[] } {
  return {
    team1: [s.team1_player1, s.team1_player2].filter((p): p is string => !!p),
    team2: [s.team2_player1, s.team2_player2].filter((p): p is string => !!p),
  };
}

/** The side the submitter played on, or null if they didn't play (an admin entering a result). */
export function submitterSide(s: Submission): Side | null {
  const { team1, team2 } = teamsOf(s);
  if (team1.includes(s.submitted_by)) return "team1";
  if (team2.includes(s.submitted_by)) return "team2";
  return null;
}

/** Whether `uid` played in this result, on either side. */
export function playsIn(s: Pick<MatchEntry, "team1" | "team2">, uid: string): boolean {
  return s.team1.includes(uid) || s.team2.includes(uid);
}

/**
 * Who may confirm or dispute a submission: a player on the other side from
 * the submitter while it is pending, or a clan admin who did not play in it
 * (pending or disputed). An admin who played is treated as a player, so
 * nobody can confirm their own result.
 */
export function canResolve(s: Submission, uid: string, isAdmin: boolean): boolean {
  if (isAdmin && !playsIn(teamsOf(s), uid)) return s.status === "pending" || s.status === "disputed";
  return s.status === "pending" && isOpponentOfSubmitter(s, uid);
}

/**
 * Whether `uid` counts as an admin for this result: a clan admin, or for a
 * tournament result the tournament host or a clan admin.
 */
export async function isResultAdmin(uid: string, s: Pick<Submission, "clan_id" | "tournament_match_id">, db: Pick<Connection, "execute">) {
  if (await isClanAdmin(uid, s.clan_id)) return true;
  if (!s.tournament_match_id) return false;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT t.created_by FROM TournamentMatches tm JOIN Tournaments t ON t.tournament_id = tm.tournament_id
     WHERE tm.match_id = ?`,
    [s.tournament_match_id]
  );
  return !!rows[0]?.created_by && rows[0].created_by === uid;
}

/** A player on the other side from the submitter. If the submitter didn't play, any player. */
export function isOpponentOfSubmitter(s: Submission, uid: string): boolean {
  const { team1, team2 } = teamsOf(s);
  const side = submitterSide(s);
  if (side === "team1") return team2.includes(uid);
  if (side === "team2") return team1.includes(uid);
  return team1.includes(uid) || team2.includes(uid);
}

export async function loadSubmission(db: Pick<Connection, "execute">, submissionId: unknown, forUpdate = false) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM MatchSubmissions WHERE submission_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [submissionId]
  );
  return (rows[0] as Submission | undefined) ?? null;
}

export class SubmissionConflict extends Error {}

/**
 * Marks a submission confirmed, records the match and updates the leaderboard.
 * Must run inside a transaction on `db`. Throws SubmissionConflict if the
 * submission was already confirmed (e.g. two people confirming at once).
 */
export async function finalizeSubmission(db: Connection, s: Submission, resolverUid: string) {
  const [upd] = await db.execute<ResultSetHeader>(
    `UPDATE MatchSubmissions SET status = 'confirmed', resolved_by = ?, resolved_at = NOW()
     WHERE submission_id = ? AND status IN ('pending', 'disputed')`,
    [resolverUid, s.submission_id]
  );
  if (upd.affectedRows === 0) throw new SubmissionConflict("This result has already been confirmed");

  const { team1, team2 } = teamsOf(s);
  if (s.tournament_match_id) {
    const res = await finalizeTournamentSubmission(db, { ...s, tournament_match_id: s.tournament_match_id }, team1, team2);
    if (!res) throw new SubmissionConflict("This match already has a result");
    return { source: "tournament" as const, matchId: s.tournament_match_id, winner: s.winner, ...res };
  }

  const winner = determineWinner(s.score_details);
  let matchId: number;

  if (s.match_type === "singles") {
    const winnerPlayer = winner === "team1" ? team1[0] : winner === "team2" ? team2[0] : null;
    const [res] = await db.execute<ResultSetHeader>(
      `INSERT INTO InternalSinglesMatches
       (clan_id, player_1, player_2, score_details, winner_player, series_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.clan_id, team1[0], team2[0], s.score_details, winnerPlayer, s.series_id]
    );
    matchId = res.insertId;
  } else {
    const [res] = await db.execute<ResultSetHeader>(
      `INSERT INTO InternalDoublesMatches
       (clan_id, team1_player1, team1_player2, team2_player1, team2_player2, score_details, winner_team, series_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.clan_id, team1[0], team1[1], team2[0], team2[1], s.score_details, winner, s.series_id]
    );
    matchId = res.insertId;
  }

  await db.execute(`UPDATE MatchSubmissions SET match_id = ? WHERE submission_id = ?`, [matchId, s.submission_id]);

  const table = s.match_type === "singles" ? "InternalSinglesMatches" : "InternalDoublesMatches";
  const [[row]] = await db.execute<RowDataPacket[]>(`SELECT match_date FROM ${table} WHERE match_id = ?`, [matchId]);

  const { points, ratingChanges } = await applyResult(db, {
    clanId: s.clan_id,
    format: s.match_type,
    team1,
    team2,
    score: s.score_details,
    match: {
      source: s.match_type === "singles" ? "clan_singles" : "clan_doubles",
      matchId,
      playedAt: new Date(row.match_date),
    },
  });

  return {
    source: s.match_type === "singles" ? "clan_singles" as const : "clan_doubles" as const,
    matchId, winner, points, ratingChanges,
  };
}
