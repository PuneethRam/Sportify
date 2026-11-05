import type { Connection } from "mysql2/promise";
import { RowDataPacket } from "mysql2";
import { createConnection, executeQuery } from "@/lib/db";
import { isProvisional, newRating, rateMatch, Rating } from "@/lib/glicko2";
import { parsePlayers } from "@/lib/metrics";

/**
 * Glicko-2 skill ratings (maths in lib/glicko2.ts).
 *
 * Each user has one rating per format (singles, doubles), across all clans and
 * tournaments; it is never reset. Every confirmed match with a winner is one
 * rating period, applied in the order the matches were confirmed:
 *
 *   - live: lib/scoring.ts applyResult() calls rateConfirmedMatch() inside the
 *     transaction that confirms the result;
 *   - replay: recomputeRatings() wipes PlayerRatings / RatingHistory and
 *     replays every confirmed match in time order with the same function.
 *     It is the backfill (scripts/backfill-ratings.ts) and what runs when a
 *     confirmed result is deleted, so we never patch a rating by hand.
 *
 * RatingHistory has one row per player per rated match; it is where the
 * "+14" on a match result and the season's biggest rating gain come from.
 */

export type MatchSource = "clan_singles" | "clan_doubles" | "tournament";
export type RatingFormat = "singles" | "doubles";

export interface RatedMatch {
  source: MatchSource;
  matchId: number;
  clanId: number | null;
  format: RatingFormat;
  team1: string[];
  team2: string[];
  winner: "team1" | "team2" | null;
  playedAt: Date;
  /** Score string, for season points. Not used by ratings. */
  score?: string | null;
}

export interface PlayerRating extends Rating {
  matches: number;
}

export interface HistoryRow {
  source: MatchSource;
  matchId: number;
  clanId: number | null;
  format: RatingFormat;
  userId: string;
  playedAt: Date;
  ratingBefore: number;
  ratingAfter: number;
  rdBefore: number;
  rdAfter: number;
  volatilityAfter: number;
}

const SOURCE_ORDER: Record<MatchSource, number> = { clan_singles: 0, clan_doubles: 1, tournament: 2 };

/** Replay order: when confirmed, then a fixed tiebreak for matches in the same second. */
export function compareMatches(a: RatedMatch, b: RatedMatch) {
  return a.playedAt.getTime() - b.playedAt.getTime()
    || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
    || a.matchId - b.matchId;
}

/** Whether a match can be rated: a winner, 1–2 players a side, equal sides, nobody twice. */
export function isRateable(m: Pick<RatedMatch, "team1" | "team2" | "winner">) {
  const all = [...m.team1, ...m.team2];
  return !!m.winner
    && m.team1.length >= 1 && m.team1.length <= 2
    && m.team1.length === m.team2.length
    && new Set(all).size === all.length;
}

/**
 * Rates one match given the players' current ratings. Returns the new ratings
 * and the history rows; does not mutate `current`.
 */
export function rateOne(m: RatedMatch, current: (uid: string) => PlayerRating) {
  const before1 = m.team1.map(current);
  const before2 = m.team2.map(current);
  const [after1, after2] = rateMatch(before1, before2, m.winner === "team1" ? 1 : 0);
  const updates = new Map<string, PlayerRating>();
  const history: HistoryRow[] = [];
  const add = (uids: string[], before: PlayerRating[], after: Rating[]) =>
    uids.forEach((uid, i) => {
      updates.set(uid, { ...after[i], matches: before[i].matches + 1 });
      history.push({
        source: m.source, matchId: m.matchId, clanId: m.clanId, format: m.format, userId: uid, playedAt: m.playedAt,
        ratingBefore: before[i].rating, ratingAfter: after[i].rating,
        rdBefore: before[i].rd, rdAfter: after[i].rd, volatilityAfter: after[i].volatility,
      });
    });
  add(m.team1, before1, after1);
  add(m.team2, before2, after2);
  return { updates, history };
}

/** Replays matches from scratch (pure). Keys of the result are `${format}:${uid}`. */
export function replay(matches: RatedMatch[]) {
  const ratings = new Map<string, PlayerRating>();
  const history: HistoryRow[] = [];
  for (const m of [...matches].sort(compareMatches)) {
    if (!isRateable(m)) continue;
    const res = rateOne(m, uid => ratings.get(`${m.format}:${uid}`) ?? { ...newRating(), matches: 0 });
    res.updates.forEach((r, uid) => ratings.set(`${m.format}:${uid}`, r));
    history.push(...res.history);
  }
  return { ratings, history };
}

type Db = Pick<Connection, "execute">;

const placeholders = (n: number) => Array(n).fill("?").join(",");

/**
 * Live update for one newly confirmed match. Call inside the confirming
 * transaction. Locks the players' rating rows so two results for the same
 * player can't both read the old rating. Returns each player's rating change
 * (empty if the match isn't rateable or was already rated).
 */
export async function rateConfirmedMatch(db: Db, m: RatedMatch): Promise<Record<string, number>> {
  if (!isRateable(m)) return {};
  const [done] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM RatingHistory WHERE source = ? AND match_id = ? LIMIT 1`,
    [m.source, m.matchId]
  );
  if (done.length) return {};

  const uids = [...m.team1, ...m.team2].sort(); // fixed lock order
  const init = newRating();
  await db.execute(
    `INSERT IGNORE INTO PlayerRatings (user_id, format, rating, rd, volatility, matches)
     VALUES ${uids.map(() => "(?, ?, ?, ?, ?, 0)").join(",")}`,
    uids.flatMap(u => [u, m.format, init.rating, init.rd, init.volatility])
  );
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT user_id, rating, rd, volatility, matches FROM PlayerRatings
     WHERE format = ? AND user_id IN (${placeholders(uids.length)}) ORDER BY user_id FOR UPDATE`,
    [m.format, ...uids]
  );
  const current = new Map(rows.map(r => [r.user_id as string, {
    rating: Number(r.rating), rd: Number(r.rd), volatility: Number(r.volatility), matches: Number(r.matches),
  }]));

  const { updates, history } = rateOne(m, uid => current.get(uid)!);
  for (const [uid, r] of updates) {
    await db.execute(
      `UPDATE PlayerRatings SET rating = ?, rd = ?, volatility = ?, matches = ? WHERE user_id = ? AND format = ?`,
      [r.rating, r.rd, r.volatility, r.matches, uid, m.format]
    );
  }
  await insertHistory(db, history);
  return Object.fromEntries(history.map(h => [h.userId, h.ratingAfter - h.ratingBefore]));
}

async function insertHistory(db: Db, rows: HistoryRow[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await db.execute(
      `INSERT INTO RatingHistory
       (source, match_id, clan_id, format, user_id, played_at, rating_before, rating_after, rd_before, rd_after, volatility_after)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}`,
      chunk.flatMap(h => [h.source, h.matchId, h.clanId, h.format, h.userId, h.playedAt,
        h.ratingBefore, h.ratingAfter, h.rdBefore, h.rdAfter, h.volatilityAfter])
    );
  }
}

const ids = (...v: unknown[]) => v.filter((p): p is string => typeof p === "string" && !!p);

/** Clan singles row → RatedMatch. The stored winner wins over re-parsing the score. */
export function fromSinglesRow(r: RowDataPacket): RatedMatch {
  return {
    source: "clan_singles", matchId: Number(r.match_id), clanId: r.clan_id ?? null, format: "singles",
    team1: ids(r.player_1), team2: ids(r.player_2),
    winner: r.winner_player && r.winner_player === r.player_1 ? "team1"
      : r.winner_player && r.winner_player === r.player_2 ? "team2" : null,
    playedAt: new Date(r.match_date),
    score: r.score_details ?? null,
  };
}

export function fromDoublesRow(r: RowDataPacket): RatedMatch {
  return {
    source: "clan_doubles", matchId: Number(r.match_id), clanId: r.clan_id ?? null, format: "doubles",
    team1: ids(r.team1_player1, r.team1_player2), team2: ids(r.team2_player1, r.team2_player2),
    winner: r.winner_team === "team1" || r.winner_team === "team2" ? r.winner_team : null,
    playedAt: new Date(r.match_date),
    score: r.score_details ?? null,
  };
}

/**
 * Tournament row (joined with Tournaments) → RatedMatch. Only matches whose
 * player selections were recorded are rated, the same rule the tournament
 * route uses for the leaderboard.
 */
export function fromTournamentRow(r: RowDataPacket): RatedMatch {
  return {
    source: "tournament", matchId: Number(r.match_id), clanId: r.clan_id ?? null,
    format: r.tournament_type === "doubles" ? "doubles" : "singles",
    team1: parsePlayers(r.team1_players), team2: parsePlayers(r.team2_players),
    winner: r.winner_team_id == null ? null
      : Number(r.winner_team_id) === Number(r.team1_id) ? "team1"
      : Number(r.winner_team_id) === Number(r.team2_id) ? "team2" : null,
    playedAt: new Date(r.played_at),
    score: r.score_details ?? null,
  };
}

export const SINGLES_SELECT =
  `SELECT match_id, clan_id, player_1, player_2, winner_player, score_details, match_date FROM InternalSinglesMatches`;
export const DOUBLES_SELECT =
  `SELECT match_id, clan_id, team1_player1, team1_player2, team2_player1, team2_player2, winner_team, score_details, match_date
   FROM InternalDoublesMatches`;
export const TOURNAMENT_SELECT =
  `SELECT tm.match_id, t.clan_id, t.tournament_type, tm.team1_id, tm.team2_id, tm.winner_team_id,
          tm.team1_players, tm.team2_players, tm.score_details, COALESCE(tm.recorded_at, tm.match_date) AS played_at
   FROM TournamentMatches tm JOIN Tournaments t ON t.tournament_id = tm.tournament_id
   WHERE tm.winner_team_id IS NOT NULL AND tm.result_status = 'confirmed'`;

/** Every confirmed match, in any order (replay sorts). */
export async function loadAllMatches(db: Db): Promise<RatedMatch[]> {
  const [singles] = await db.execute<RowDataPacket[]>(SINGLES_SELECT);
  const [doubles] = await db.execute<RowDataPacket[]>(DOUBLES_SELECT);
  const [tournament] = await db.execute<RowDataPacket[]>(TOURNAMENT_SELECT);
  return [...singles.map(fromSinglesRow), ...doubles.map(fromDoublesRow), ...tournament.map(fromTournamentRow)];
}

/**
 * Rebuilds every rating from match history. Idempotent: running it twice
 * gives the same tables. Serialised with a named lock so two deletes at once
 * don't interleave.
 */
export async function recomputeRatings(): Promise<{ matches: number; players: number }> {
  const conn = await createConnection();
  try {
    await conn.query(`SELECT GET_LOCK('sportify_ratings_replay', 60)`);
    await conn.beginTransaction();
    try {
      // Lock the tables' rows first so live updates wait for the replay
      await conn.execute(`SELECT COUNT(*) FROM PlayerRatings FOR UPDATE`);
      const matches = await loadAllMatches(conn);
      const { ratings, history } = replay(matches);
      await conn.execute(`DELETE FROM RatingHistory`);
      await conn.execute(`DELETE FROM PlayerRatings`);
      const rows = [...ratings.entries()];
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await conn.execute(
          `INSERT INTO PlayerRatings (user_id, format, rating, rd, volatility, matches)
           VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(",")}`,
          chunk.flatMap(([key, r]) => {
            const [format, ...uid] = key.split(":");
            return [uid.join(":"), format, r.rating, r.rd, r.volatility, r.matches];
          })
        );
      }
      await insertHistory(conn, history);
      await conn.commit();
      return { matches: new Set(history.map(h => `${h.source}:${h.matchId}`)).size, players: ratings.size };
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.query(`SELECT RELEASE_LOCK('sportify_ratings_replay')`).catch(() => {});
    await conn.end();
  }
}

export interface PublicRating {
  rating: number;      // rounded
  rd: number;          // rounded
  matches: number;
  provisional: boolean;
}

export function publicRating(r: { rating: number; rd: number; matches: number } | undefined): PublicRating {
  const v = r ?? { ...newRating(), matches: 0 };
  return {
    rating: Math.round(v.rating),
    rd: Math.round(v.rd),
    matches: v.matches,
    provisional: isProvisional(v),
  };
}

/** Singles and doubles ratings for some users (defaults for anyone unrated). */
export async function loadRatings(uids: string[]): Promise<Map<string, Record<RatingFormat, PublicRating>>> {
  const unique = [...new Set(uids)];
  const out = new Map<string, Record<RatingFormat, PublicRating>>();
  if (!unique.length) return out;
  const rows = await executeQuery(
    `SELECT user_id, format, rating, rd, matches FROM PlayerRatings WHERE user_id IN (${placeholders(unique.length)})`,
    unique
  ) as RowDataPacket[];
  const raw = new Map(rows.map(r => [`${r.format}:${r.user_id}`, {
    rating: Number(r.rating), rd: Number(r.rd), matches: Number(r.matches),
  }]));
  for (const u of unique) {
    out.set(u, { singles: publicRating(raw.get(`singles:${u}`)), doubles: publicRating(raw.get(`doubles:${u}`)) });
  }
  return out;
}

/** Rating change per player for some matches of one source: matchId → uid → change (rounded). */
export async function loadRatingChanges(source: MatchSource, matchIds: number[]) {
  const out = new Map<number, Record<string, number>>();
  if (!matchIds.length) return out;
  const rows = await executeQuery(
    `SELECT match_id, user_id, rating_after - rating_before AS delta FROM RatingHistory
     WHERE source = ? AND match_id IN (${placeholders(matchIds.length)})`,
    [source, ...matchIds]
  ) as RowDataPacket[];
  for (const r of rows) {
    const m = out.get(Number(r.match_id)) ?? {};
    m[r.user_id] = Math.round(Number(r.delta));
    out.set(Number(r.match_id), m);
  }
  return out;
}

/**
 * Sort for leaderboards: rated players by rating (highest first), then
 * provisional players by rating.
 */
export function compareByRating(a: PublicRating, b: PublicRating) {
  return Number(a.provisional) - Number(b.provisional) || b.rating - a.rating || b.matches - a.matches;
}
