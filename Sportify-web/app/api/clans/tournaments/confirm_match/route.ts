import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, getManagedTournament } from "@/lib/authz";
import { SubmissionConflict } from "@/lib/matchSubmissions";
import { notifyOvertakes } from "@/lib/seasons";
import {
  canResolve, confirmTournamentResult, loadTournamentResult, notifyTournamentResultConfirmed,
  notifyTournamentResultDisputed, sideOf,
} from "@/lib/tournamentResults";

// POST /api/clans/tournaments/confirm_match
// Body: { tournamentId, matchId, action: "confirm" | "reject" }
// A player on the other side from whoever entered the result can confirm or
// dispute it while it is pending. The host or a clan admin who did not play
// in it can confirm a pending or disputed result, or mark it disputed. Anyone
// who played on the entering side (doubles partner included) is refused.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { tournamentId, matchId, action } = await req.json();
  if (!tournamentId || !matchId || (action !== "confirm" && action !== "reject")) {
    return NextResponse.json(
      { success: false, error: "tournamentId, matchId and action (confirm | reject) are required" }, { status: 400 }
    );
  }

  const manages = !!(await getManagedTournament(uid, tournamentId));
  const connection = await createConnection();
  try {
    await connection.beginTransaction();
    try {
      const match = await loadTournamentResult(connection, tournamentId, matchId, true);
      if (!match || match.winner_team_id == null) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "Result not found" }, { status: 404 });
      }
      if (match.result_status === "confirmed") {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "This result is already confirmed" }, { status: 409 });
      }

      if (!canResolve(match, uid, manages)) {
        await connection.rollback();
        const mine = sideOf(match, uid);
        if (mine && mine === sideOf(match, match.recorded_by)) {
          return forbidden("You played in this match, so the other side or a different host or admin has to confirm it");
        }
        // Players act on pending results; once disputed, a host or admin who didn't play decides.
        if (mine) {
          return NextResponse.json({ success: false, error: `This result is already ${match.result_status}` }, { status: 409 });
        }
        return forbidden("Only a player on the other side, the host or a clan admin can confirm this result");
      }

      if (action === "reject") {
        await connection.execute(
          `UPDATE TournamentMatches SET result_status = 'disputed', resolved_by = ?, resolved_at = NOW() WHERE match_id = ?`,
          [uid, match.match_id]
        );
        await connection.commit();
        await notifyTournamentResultDisputed(match, uid);
        return NextResponse.json({ success: true, status: "disputed" });
      }

      const applied = await confirmTournamentResult(connection, match, uid);
      await connection.commit();
      await notifyTournamentResultConfirmed(match, uid);
      if (applied) await notifyOvertakes(match.clan_id, [{ source: "tournament", matchId: match.match_id }]);
      return NextResponse.json({
        success: true, status: "confirmed",
        ratingChanges: Object.fromEntries(Object.entries(applied?.ratingChanges ?? {}).map(([u, d]) => [u, Math.round(d)])),
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    if (error instanceof SubmissionConflict) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error confirming tournament result:", error);
    return NextResponse.json({ success: false, error: "Failed to confirm result" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
