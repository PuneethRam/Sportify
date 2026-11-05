import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { insertSubmission, loadSubmission, playsIn } from "@/lib/matchSubmissions";
import { notifyResultSubmitted } from "@/lib/resultNotifications";
import { notifyOvertakes } from "@/lib/seasons";
import {
  loadTournamentMatch, openTournamentSubmission, recordTournamentResult, resolveLineup,
} from "@/lib/tournamentResults";

const roundChanges = (a: { ratingChanges: Record<string, number> } | null) =>
  Object.fromEntries(Object.entries(a?.ratingChanges ?? {}).map(([u, d]) => [u, Math.round(d)]));

// POST /api/clans/tournaments/update_match
// Body: { tournamentId, matchId, winner_team_id, score_details, team1_players?, team2_players? }
// The tournament host or a clan admin records a result. If they didn't play
// in the match it counts at once; if they did it stays pending (status
// "pending", submissionId) until a player on the other side or a different
// host / admin confirms it through /api/clans/matches/confirm.
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
  const bad = async (status: number, error: string) => {
    await connection.rollback();
    return NextResponse.json({ success: false, error }, { status });
  };

  try {
    await connection.beginTransaction();

    const match = await loadTournamentMatch(connection, tournamentId, matchId, true);
    if (!match) return await bad(404, "Match not found");
    // A recorded result has already moved the leaderboard and the bracket;
    // recording it again would count it twice.
    if (match.winner_team_id !== null) return await bad(409, "This match already has a result");
    if (await openTournamentSubmission(connection, matchId)) return await bad(409, "This result is waiting for confirmation");
    if (winner_team_id && winner_team_id !== match.team1_id && winner_team_id !== match.team2_id) {
      return await bad(400, "Winner must be one of the two teams");
    }

    const needed = tournament.tournament_type === "doubles" ? 2 : 1;
    const team1 = resolveLineup(team1_players, match.team1_players, match.roster1, needed);
    const team2 = resolveLineup(team2_players, match.team2_players, match.roster2, needed);
    if (typeof team1 === "string") return await bad(400, team1);
    if (typeof team2 === "string") return await bad(400, team2);

    const played = playsIn({ team1: team1 ?? [], team2: team2 ?? [] }, uid);
    if (winner_team_id && !played &&
        ((match.roster1.includes(uid) && !team1) || (match.roster2.includes(uid) && !team2))) {
      return await bad(400, "You're on one of these teams: pick who played so we know whether you did");
    }

    // ── The recorder played: pending until the other side or another admin confirms ──
    if (winner_team_id && played) {
      if (!team1 || !team2) return await bad(400, "Pick who played for both teams so the other side can confirm");
      let scoreDetails: { score: string } & Record<string, unknown>;
      try {
        const parsed = JSON.parse(score_details);
        scoreDetails = parsed && typeof parsed === "object" && typeof parsed.score === "string"
          ? parsed : { score: String(score_details ?? "") };
      } catch {
        scoreDetails = { score: String(score_details ?? "") };
      }
      const submissionId = await insertSubmission(
        connection, tournament.clan_id,
        { matchType: needed === 2 ? "doubles" : "singles", team1, team2, scoreDetails },
        uid,
        { entryMethod: "admin", tournament: { matchId: Number(matchId), winner: winner_team_id === match.team1_id ? "team1" : "team2" } }
      );
      await connection.commit();
      const submission = await loadSubmission(connection, submissionId);
      if (submission) await notifyResultSubmitted(submission);
      return NextResponse.json({ success: true, status: "pending", submissionId, ratingChanges: {} }, { status: 201 });
    }

    // ── The recorder didn't play: counts at once ──
    const applied = await recordTournamentResult(connection, {
      tournamentId: Number(tournamentId),
      matchId: Number(matchId),
      clanId: tournament.clan_id,
      format: tournament.format ?? "",
      winnerTeamId: winner_team_id ?? null,
      scoreDetails: score_details ?? null,
      team1Players: team1,
      team2Players: team2,
      recordedBy: uid,
    });

    await connection.commit();
    if (applied) await notifyOvertakes(tournament.clan_id, [{ source: "tournament", matchId: Number(matchId) }]);
    return NextResponse.json({ success: true, status: "confirmed", ratingChanges: roundChanges(applied) });
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
