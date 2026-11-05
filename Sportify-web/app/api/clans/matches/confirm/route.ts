import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden } from "@/lib/authz";
import {
  canResolve, finalizeSubmission, isOpponentOfSubmitter, isResultAdmin, loadSubmission, playsIn, SubmissionConflict, teamsOf,
} from "@/lib/matchSubmissions";
import { notifyResultConfirmed, notifyResultDisputed } from "@/lib/resultNotifications";
import { notifyOvertakes } from "@/lib/seasons";

// POST /api/clans/matches/confirm
// Body: { submissionId, action: "confirm" | "reject" }
// A player on the other side from the submitter can confirm or dispute a
// pending result. A clan admin who did not play in it can confirm (override)
// a pending or disputed result, or mark it disputed. An admin who played is
// treated as a player, so they can't confirm their own result. For a
// tournament result the tournament host counts as an admin too.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { submissionId, action } = await req.json();
  if (!submissionId || (action !== "confirm" && action !== "reject")) {
    return NextResponse.json({ success: false, error: "submissionId and action (confirm | reject) are required" }, { status: 400 });
  }

  const connection = await createConnection();
  try {
    await connection.beginTransaction();
    try {
      const submission = await loadSubmission(connection, submissionId, true);
      if (!submission) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "Result not found" }, { status: 404 });
      }

      if (submission.status === "confirmed") {
        await connection.rollback();
        return NextResponse.json({ success: false, error: "This result is already confirmed" }, { status: 409 });
      }

      const admin = await isResultAdmin(uid, submission, connection);
      const opponent = isOpponentOfSubmitter(submission, uid);
      if (!canResolve(submission, uid, admin)) {
        await connection.rollback();
        if (admin && playsIn(teamsOf(submission), uid)) {
          return forbidden("You played in this match, so the other side or a different admin has to confirm it");
        }
        // Opponents act on pending results; once disputed, only an admin who didn't play decides.
        if (opponent) {
          return NextResponse.json({ success: false, error: `This result is already ${submission.status}` }, { status: 409 });
        }
        return forbidden(submission.tournament_match_id
          ? "Only a player on the other side or a tournament host / clan admin can confirm this result"
          : "Only a player on the other side or a clan admin can confirm this result");
      }

      if (action === "reject") {
        await connection.execute(
          `UPDATE MatchSubmissions SET status = 'disputed', resolved_by = ?, resolved_at = NOW() WHERE submission_id = ?`,
          [uid, submission.submission_id]
        );
        await connection.commit();
        await notifyResultDisputed(submission, uid);
        return NextResponse.json({ success: true, status: "disputed", matchId: null });
      }

      const result = await finalizeSubmission(connection, submission, uid);
      await connection.commit();
      await notifyResultConfirmed(submission, uid);
      await notifyOvertakes(submission.clan_id, [{ source: result.source, matchId: result.matchId }]);
      return NextResponse.json({
        success: true, status: "confirmed", matchId: result.matchId, pointsAwarded: result.points,
        ratingChanges: Object.fromEntries(Object.entries(result.ratingChanges).map(([u, d]) => [u, Math.round(d)])),
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    if (error instanceof SubmissionConflict) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error confirming match:", error);
    return NextResponse.json({ success: false, error: "Failed to confirm result" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
