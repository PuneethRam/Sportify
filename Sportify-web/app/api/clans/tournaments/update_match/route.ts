import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { parsePlayers } from "@/lib/metrics";
import { playsIn } from "@/lib/matchSubmissions";
import { notifyOvertakes } from "@/lib/seasons";
import {
  applyTournamentResult, correctionBlock, isBracketMatch, loadTournamentMatches, loadTournamentResult,
  notifyTournamentResultPending, ResultStatus, sidesOf,
} from "@/lib/tournamentResults";

function getStageName(matchCount: number, roundNumber: number, position: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return `Semi Final - Match ${position + 1}`;
  if (matchCount === 4) return `Quarter Final - Match ${position + 1}`;
  return `Round ${roundNumber} - Match ${position + 1}`;
}

const roundChanges = (a: { ratingChanges: Record<string, number> } | null) =>
  Object.fromEntries(Object.entries(a?.ratingChanges ?? {}).map(([u, d]) => [u, Math.round(d)]));

// POST /api/clans/tournaments/update_match
// Records a result, or corrects a pending / disputed one. The winner advances
// straight away; the result counts (ratings, points) only once confirmed. See
// lib/tournamentResults.ts for who confirms what.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { tournamentId, matchId, winner_team_id, score_details, team1_players, team2_players } = await req.json();

  if (!tournamentId || !matchId) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  // Only the tournament host or a clan admin records tournament results
  const tournament = await getManagedTournament(uid, tournamentId);
  if (!tournament) return forbidden("Only the tournament host or a clan admin can record results");

  const connection = await createConnection();

  try {
    await connection.beginTransaction();

    const existing = await loadTournamentResult(connection, tournamentId, matchId, true);
    if (!existing) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }
    // A confirmed result has already moved the leaderboard and ratings; a
    // pending or disputed one can be corrected until later rounds depend on it.
    const previousWinner = existing.winner_team_id;
    const correcting = previousWinner !== null;
    if (correcting) {
      if (!winner_team_id) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "A corrected result needs a winner" }, { status: 400 });
      }
      const blocked = correctionBlock(existing, await loadTournamentMatches(connection, tournamentId));
      if (blocked) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: blocked }, { status: 409 });
      }
    }
    if (winner_team_id && winner_team_id !== existing.team1_id && winner_team_id !== existing.team2_id) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: "Winner must be one of the two teams" }, { status: 400 });
    }
    // The line-up has to come from the team, or "who played" means nothing
    for (const [picked, roster] of [[team1_players, existing.roster1], [team2_players, existing.roster2]]) {
      const squad = parsePlayers(roster);
      if (Array.isArray(picked) && squad.length && parsePlayers(picked).some(p => !squad.includes(p))) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "Selected players must be on their team" }, { status: 400 });
      }
    }

    // Serialize player selections if provided
    const t1Players = Array.isArray(team1_players) ? JSON.stringify(team1_players) : null;
    const t2Players = Array.isArray(team2_players) ? JSON.stringify(team2_players) : null;

    // Nobody confirms their own result: if the person entering it played
    // (either team, partner's entry included), the other side has to confirm.
    const after = { ...existing, team1_players: t1Players ?? existing.team1_players, team2_players: t2Players ?? existing.team2_players };
    const status: ResultStatus = winner_team_id && playsIn(sidesOf(after), uid) ? "pending" : "confirmed";

    await connection.execute(
      `UPDATE TournamentMatches
       SET winner_team_id = ?, score_details = ?, recorded_at = NOW(),
           team1_players = COALESCE(?, team1_players),
           team2_players = COALESCE(?, team2_players),
           result_status = ?, recorded_by = ?, resolved_by = NULL, resolved_at = NULL
       WHERE match_id = ? AND tournament_id = ?`,
      [winner_team_id ?? null, score_details ?? null, t1Players, t2Players, status, uid, matchId, tournamentId]
    );

    const format: string = tournament.format ?? "";
    const clanId: number = tournament.clan_id;
    const { round_number } = existing;

    // ── Leaderboard + rating update, only for a confirmed result ──
    const applied = winner_team_id && status === "confirmed"
      ? await applyTournamentResult(connection, clanId, Number(matchId))
      : null;

    // ── Bracket: the winner advances whether or not the result is confirmed ──
    if (isBracketMatch({ format, phase: existing.phase })) {
      if (correcting && winner_team_id && previousWinner !== winner_team_id) {
        // The old winner was already drawn into the next round; swap in the new one
        await connection.execute(
          `UPDATE TournamentMatches
           SET team1_id = IF(team1_id = ?, ?, team1_id), team2_id = IF(team2_id = ?, ?, team2_id)
           WHERE tournament_id = ? AND round_number = ? AND phase = 'knockout' AND winner_team_id IS NULL
             AND (team1_id = ? OR team2_id = ?)`,
          [previousWinner, winner_team_id, previousWinner, winner_team_id, tournamentId, round_number + 1, previousWinner, previousWinner]
        );
      } else if (!correcting && winner_team_id) {
        const [pending] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM TournamentMatches
           WHERE tournament_id = ? AND round_number = ? AND winner_team_id IS NULL`,
          [tournamentId, round_number]
        );
        const [drawn] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM TournamentMatches WHERE tournament_id = ? AND round_number = ?`,
          [tournamentId, round_number + 1]
        );

        if (pending[0].cnt === 0 && drawn[0].cnt === 0) {
          const [roundMatches] = await connection.execute<RowDataPacket[]>(
            `SELECT winner_team_id, match_position FROM TournamentMatches
             WHERE tournament_id = ? AND round_number = ?
             ORDER BY match_position ASC`,
            [tournamentId, round_number]
          );

          if (roundMatches.length > 1) {
            const nextRound = round_number + 1;
            const nextMatchCount = Math.floor(roundMatches.length / 2);

            for (let i = 0; i < roundMatches.length; i += 2) {
              const team1 = roundMatches[i].winner_team_id;
              const team2 = roundMatches[i + 1]?.winner_team_id ?? null;
              const pos = Math.floor(i / 2);
              const stageName = getStageName(nextMatchCount, nextRound, pos);

              await connection.execute<ResultSetHeader>(
                `INSERT INTO TournamentMatches
                 (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
                 VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
                [tournamentId, team1, team2, stageName, nextRound, pos]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    if (applied) await notifyOvertakes(clanId, [{ source: "tournament", matchId: Number(matchId) }]);
    if (status === "pending") {
      await notifyTournamentResultPending({ ...existing, ...after, recorded_by: uid });
    }
    return NextResponse.json({ success: true, status: winner_team_id ? status : null, ratingChanges: roundChanges(applied) });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating tournament match:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update match" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
