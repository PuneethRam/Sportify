import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin } from "@/lib/authz";
import { finalizeSubmission, isOpponentOfSubmitter, loadSubmission, SubmissionConflict } from "@/lib/matchSubmissions";
import { notifyResultConfirmed, notifyResultDisputed } from "@/lib/resultNotifications";
import { notifyOvertakes } from "@/lib/seasons";

// POST /api/clans/matches/confirm
// Body: { submissionId, action: "confirm" | "reject" }
// A player on the other side from the submitter can confirm or dispute a
// pending result. A clan admin can confirm (override) a pending or disputed
// result, or mark it disputed.
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

      const admin = await isClanAdmin(uid, submission.clan_id);
      const opponent = isOpponentOfSubmitter(submission, uid);
      if (!admin && !opponent) {
        await connection.rollback();
        return forbidden("Only a player on the other side or a clan admin can confirm this result");
      }

      // Opponents act on pending results; once disputed, only an admin decides.
      const actionable = submission.status === "pending" || (admin && submission.status === "disputed");
      if (!actionable) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: `This result is already ${submission.status}` }, { status: 409 });
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
      await notifyOvertakes(submission.clan_id, [{
        source: submission.match_type === "singles" ? "clan_singles" : "clan_doubles", matchId: result.matchId,
      }]);
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
