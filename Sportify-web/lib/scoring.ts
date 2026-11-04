import type { Connection } from "mysql2/promise";
import { MatchSource, rateConfirmedMatch } from "@/lib/ratings";

/**
 * The one place clan leaderboard points are calculated and applied.
 *
 * Clan matches (on confirmation) and tournament matches both go through
 * applyResult(), which updates two things:
 *   - ClanLeaderboard points (the ScoringModel below; also used for season
 *     standings in lib/seasons.ts);
 *   - the players' Glicko-2 skill ratings (lib/ratings.ts), when the caller
 *     says which stored match this is (`match`).
 */

export type Side = "team1" | "team2";
export type MatchFormat = "singles" | "doubles";

export interface MatchResult {
  clanId: number | string;
  format: MatchFormat;
  team1: string[];
  team2: string[];
  /** Games as "21-15, 18-21, 21-19", team1's points first. */
  score: string;
  /** Set when the winner is declared separately (tournaments); otherwise derived from the score. */
  winner?: Side | null;
  /** The stored match row, so the result can be rated. Omit to update points only. */
  match?: { source: MatchSource; matchId: number; playedAt: Date };
}

export interface AppliedResult {
  /** Points the winners gained and the losers lost (0 for a draw). */
  points: number;
  /** Rating change per player, unrounded. Empty if the match wasn't rated. */
  ratingChanges: Record<string, number>;
}

/** Points every new clan / batch member starts on. */
export const STARTING_POINTS = 0;

/** Parses "21-15, 18-21" (or a score_details JSON blob with a `score` field) into games. */
export function parseGames(score: string | null | undefined): [number, number][] {
  if (!score) return [];
  let str = String(score);
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === "object" && typeof parsed.score === "string") str = parsed.score;
  } catch { /* plain score string */ }
  const games: [number, number][] = [];
  for (const g of str.split(",")) {
    const m = /(\d+)\s*-\s*(\d+)/.exec(g);
    if (m) games.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
  }
  return games;
}

/** Winner by games won; null for a draw or an unparseable score. */
export function determineWinner(score: string | null | undefined): Side | null {
  let t1 = 0, t2 = 0;
  for (const [a, b] of parseGames(score)) {
    if (a > b) t1++;
    else if (b > a) t2++;
  }
  if (t1 > t2) return "team1";
  if (t2 > t1) return "team2";
  return null;
}

export interface ScoringModel {
  /** Points the winners gain and the losers lose for this result. */
  pointsFor(result: MatchResult, winner: Side): number;
}

/**
 * Current rule: 5 points plus 2 for every 10 points of net margin across all
 * games. "21-10, 15-21, 21-18" → net 11 - 6 + 3 = 8 → 5 + 1.6 = 6.6.
 * Losers lose the same amount, floored at zero.
 */
export const marginScoring: ScoringModel = {
  pointsFor(result) {
    const games = parseGames(result.score);
    if (!games.length) return 5;
    const net = games.reduce((sum, [a, b]) => sum + (a - b), 0);
    return 5 + (Math.abs(net) / 10) * 2;
  },
};

export const scoring: ScoringModel = marginScoring;

type Db = Pick<Connection, "execute">;

/**
 * Applies a confirmed result to ClanLeaderboard. Call inside the same
 * transaction that marks the match confirmed so a result is counted once.
 */
export async function applyResult(db: Db, result: MatchResult, model: ScoringModel = scoring): Promise<AppliedResult> {
  const winner = result.winner !== undefined ? result.winner : determineWinner(result.score);
  const players = [...result.team1, ...result.team2].filter(Boolean);
  const ratingChanges = result.match
    ? await rateConfirmedMatch(db, {
        source: result.match.source,
        matchId: result.match.matchId,
        clanId: Number(result.clanId),
        format: result.format,
        team1: result.team1.filter(Boolean),
        team2: result.team2.filter(Boolean),
        winner,
        playedAt: result.match.playedAt,
      })
    : {};

  if (!winner) {
    for (const userId of players) {
      await db.execute(
        `UPDATE ClanLeaderboard
         SET matchesplayed = matchesplayed + 1, last_updated = CURRENT_TIMESTAMP
         WHERE clan_id = ? AND user_id = ?`,
        [result.clanId, userId]
      );
    }
    return { points: 0, ratingChanges };
  }

  const points = model.pointsFor(result, winner);
  const ptsCol = result.format === "doubles" ? "doubles_points" : "singles_points";
  const winners = (winner === "team1" ? result.team1 : result.team2).filter(Boolean);
  const losers  = (winner === "team1" ? result.team2 : result.team1).filter(Boolean);

  for (const userId of winners) {
    await db.execute(
      `UPDATE ClanLeaderboard
       SET clan_points   = clan_points + ?,
           ${ptsCol}     = ${ptsCol} + ?,
           matchesplayed = matchesplayed + 1,
           matcheswon    = matcheswon + 1,
           last_updated  = CURRENT_TIMESTAMP
       WHERE clan_id = ? AND user_id = ?`,
      [points, points, result.clanId, userId]
    );
  }
  for (const userId of losers) {
    await db.execute(
      `UPDATE ClanLeaderboard
       SET clan_points   = GREATEST(clan_points - ?, 0),
           ${ptsCol}     = GREATEST(${ptsCol} - ?, 0),
           matchesplayed = matchesplayed + 1,
           matcheslost   = matcheslost + 1,
           last_updated  = CURRENT_TIMESTAMP
       WHERE clan_id = ? AND user_id = ?`,
      [points, points, result.clanId, userId]
    );
  }
  return { points, ratingChanges };
}
