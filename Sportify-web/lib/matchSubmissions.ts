import type { Connection } from "mysql2/promise";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { applyResult, determineWinner, MatchFormat, Side } from "@/lib/scoring";

/**
 * Clan match results go through MatchSubmissions:
 *
 *   submit (player or admin) ─► pending ─► confirmed  (opponent or clan admin)
 *                                  └─────► disputed   (opponent rejects; a clan admin can still confirm)
 *
 * Only finalizeSubmission() writes the InternalSinglesMatches /
 * InternalDoublesMatches row and touches ClanLeaderboard, so every existing
 * stats query over those tables only ever sees confirmed results.
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

  const points = await applyResult(db, {
    clanId: s.clan_id,
    format: s.match_type,
    team1,
    team2,
    score: s.score_details,
  });

  return { matchId, winner, points };
}
