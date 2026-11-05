import type { Connection } from "mysql2/promise";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { applyResult, Side } from "@/lib/scoring";
import { fromTournamentRow, TOURNAMENT_SELECT } from "@/lib/ratings";
import { parsePlayers } from "@/lib/metrics";

/**
 * Tournament results follow the clan rule (lib/matchSubmissions.ts): nobody
 * confirms their own result.
 *
 *   host / admin who didn't play ─► recordTournamentResult()  (counts at once)
 *   host / admin who played      ─► MatchSubmissions row with tournament_match_id
 *                                    ─► confirmed by the other side or a different
 *                                       host / admin ─► recordTournamentResult()
 *
 * Only recordTournamentResult() sets TournamentMatches.winner_team_id, so the
 * bracket, standings and ratings never see a pending result.
 */

type Db = Pick<Connection, "execute">;

function getStageName(matchCount: number, roundNumber: number, position: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return `Semi Final - Match ${position + 1}`;
  if (matchCount === 4) return `Quarter Final - Match ${position + 1}`;
  return `Round ${roundNumber} - Match ${position + 1}`;
}

export interface TournamentMatch {
  match_id: number;
  tournament_id: number;
  team1_id: number | null;
  team2_id: number | null;
  winner_team_id: number | null;
  team1_players: string | null;
  team2_players: string | null;
  roster1: string[];
  roster2: string[];
}

/** A bracket match with both teams' rosters. */
export async function loadTournamentMatch(db: Db, tournamentId: unknown, matchId: unknown, forUpdate = false) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT tm.match_id, tm.tournament_id, tm.team1_id, tm.team2_id, tm.winner_team_id,
            tm.team1_players, tm.team2_players, a.players AS r1, b.players AS r2
     FROM TournamentMatches tm
     LEFT JOIN TournamentTeams a ON a.team_id = tm.team1_id
     LEFT JOIN TournamentTeams b ON b.team_id = tm.team2_id
     WHERE tm.match_id = ? AND tm.tournament_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [matchId, tournamentId]
  );
  const r = rows[0];
  if (!r) return null;
  return { ...r, roster1: parsePlayers(r.r1), roster2: parsePlayers(r.r2) } as TournamentMatch;
}

/**
 * Who played on one side: the lineup sent with the result, else the one
 * already stored on the match, else the roster when it is exactly one
 * lineup's worth. Returns an error message for a lineup that isn't from the
 * team's roster, or null when it can't be told.
 */
export function resolveLineup(sent: unknown, stored: string | null, roster: string[], needed: number): string[] | null | string {
  if (sent !== undefined && sent !== null) {
    if (!Array.isArray(sent) || !sent.length || sent.some(p => !p || typeof p !== "string")) return "Invalid player selection";
    if (sent.length > needed || new Set(sent).size !== sent.length) return `Pick ${needed} player${needed > 1 ? "s" : ""} per team`;
    if (roster.length && sent.some(p => !roster.includes(p))) return "Players must be from the team that played";
    return sent;
  }
  const kept = parsePlayers(stored);
  if (kept.length) return kept;
  return roster.length === needed ? roster : null;
}

/** The pending or disputed submission waiting on a bracket match, if any. */
export async function openTournamentSubmission(db: Db, matchId: unknown) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM MatchSubmissions WHERE tournament_match_id = ? AND status IN ('pending', 'disputed')`,
    [matchId]
  );
  return rows[0] ?? null;
}

/** How many of a tournament's results are waiting for confirmation. */
export async function countOpenTournamentResults(db: Db, tournamentId: unknown): Promise<number> {
  const [[row]] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM MatchSubmissions ms
     JOIN TournamentMatches tm ON tm.match_id = ms.tournament_match_id
     WHERE tm.tournament_id = ? AND ms.status IN ('pending', 'disputed')`,
    [tournamentId]
  );
  return Number(row.cnt);
}

export const waitingForConfirmation = (n: number) =>
  `${n} result${n === 1 ? " is" : "s are"} waiting for confirmation`;

export interface TournamentResult {
  tournamentId: number;
  matchId: number;
  clanId: number;
  /** Tournaments.format: knockout | round_robin | group_knockout */
  format: string;
  winnerTeamId: number | null;
  scoreDetails: string | null;
  team1Players: string[] | null;
  team2Players: string[] | null;
  recordedBy: string;
}

/**
 * Writes a result that counts: the match row, the leaderboard and rating, and
 * the next knockout round once a round is complete. Must run inside a
 * transaction on `db`. Returns the applied leaderboard/rating change, if rated.
 */
export async function recordTournamentResult(db: Connection, r: TournamentResult) {
  await db.execute(
    `UPDATE TournamentMatches
     SET winner_team_id = ?, score_details = ?, recorded_at = NOW(), recorded_by = ?,
         team1_players = COALESCE(?, team1_players),
         team2_players = COALESCE(?, team2_players)
     WHERE match_id = ? AND tournament_id = ?`,
    [r.winnerTeamId, r.scoreDetails, r.recordedBy,
     r.team1Players ? JSON.stringify(r.team1Players) : null,
     r.team2Players ? JSON.stringify(r.team2Players) : null,
     r.matchId, r.tournamentId]
  );
  if (!r.winnerTeamId) return null;

  // ── Leaderboard + rating update, from the players stored on the match ──
  // (the same rule lib/ratings.ts uses when it replays history)
  let applied: Awaited<ReturnType<typeof applyResult>> | null = null;
  const [[row]] = await db.execute<RowDataPacket[]>(`${TOURNAMENT_SELECT} AND tm.match_id = ?`, [r.matchId]);
  const rated = fromTournamentRow(row);
  if (rated.team1.length && rated.team2.length) {
    applied = await applyResult(db, {
      clanId: r.clanId,
      format: rated.format,
      team1: rated.team1,
      team2: rated.team2,
      score: r.scoreDetails ?? "",
      winner: rated.winner,
      match: { source: "tournament", matchId: rated.matchId, playedAt: rated.playedAt },
    });
  }

  await advanceBracket(db, r);
  return applied;
}

/** Seeds the next knockout round once every match in this one has a winner. */
async function advanceBracket(db: Connection, r: TournamentResult) {
  if (r.format !== "knockout" && r.format !== "group_knockout" && r.format !== "round_robin") return;
  const [matchRows] = await db.execute<RowDataPacket[]>(
    `SELECT round_number, phase FROM TournamentMatches WHERE match_id = ?`,
    [r.matchId]
  );
  if (!matchRows.length) return;
  const { round_number, phase } = matchRows[0];

  // For group_knockout and round_robin, only advance bracket in the knockout phase
  if (r.format !== "knockout" && phase !== "knockout") return;

  const [pending] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM TournamentMatches
     WHERE tournament_id = ? AND round_number = ? AND winner_team_id IS NULL`,
    [r.tournamentId, round_number]
  );
  if (pending[0].cnt !== 0) return;

  const [roundMatches] = await db.execute<RowDataPacket[]>(
    `SELECT winner_team_id, match_position FROM TournamentMatches
     WHERE tournament_id = ? AND round_number = ?
     ORDER BY match_position ASC`,
    [r.tournamentId, round_number]
  );
  if (roundMatches.length <= 1) return;

  const nextRound = round_number + 1;
  const nextMatchCount = Math.floor(roundMatches.length / 2);
  for (let i = 0; i < roundMatches.length; i += 2) {
    const team1 = roundMatches[i].winner_team_id;
    const team2 = roundMatches[i + 1]?.winner_team_id ?? null;
    const pos = Math.floor(i / 2);
    await db.execute<ResultSetHeader>(
      `INSERT INTO TournamentMatches
       (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
       VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
      [r.tournamentId, team1, team2, getStageName(nextMatchCount, nextRound, pos), nextRound, pos]
    );
  }
}

/**
 * Finalises a confirmed tournament submission (called from finalizeSubmission).
 * Returns null if the match already has a result.
 */
export async function finalizeTournamentSubmission(
  db: Connection,
  s: { tournament_match_id: number; winner: Side | null; score_details: string; submitted_by: string },
  team1: string[],
  team2: string[]
) {
  const [[m]] = await db.execute<RowDataPacket[]>(
    `SELECT tm.tournament_id, tm.team1_id, tm.team2_id, tm.winner_team_id, t.clan_id, t.format
     FROM TournamentMatches tm JOIN Tournaments t ON t.tournament_id = tm.tournament_id
     WHERE tm.match_id = ? FOR UPDATE`,
    [s.tournament_match_id]
  );
  if (!m) throw new Error("Tournament match not found");
  if (m.winner_team_id !== null) return null;
  const applied = await recordTournamentResult(db, {
    tournamentId: m.tournament_id,
    matchId: s.tournament_match_id,
    clanId: m.clan_id,
    format: m.format ?? "",
    winnerTeamId: s.winner === "team1" ? m.team1_id : s.winner === "team2" ? m.team2_id : null,
    scoreDetails: s.score_details,
    team1Players: team1,
    team2Players: team2,
    recordedBy: s.submitted_by,
  });
  return { points: applied?.points ?? 0, ratingChanges: applied?.ratingChanges ?? {} };
}
