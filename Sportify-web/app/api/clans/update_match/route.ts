import { createConnection } from '@/lib/db';
import { NextResponse } from "next/server";
import { RowDataPacket } from 'mysql2';
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { areClanMembers, forbidden, isClanAdmin, isClanMember } from "@/lib/authz";
import { determineWinner } from "@/lib/scoring";
import { finalizeSubmission, insertSubmission, loadSubmission, parseMatchEntry } from "@/lib/matchSubmissions";
import { notifyOvertakes } from "@/lib/seasons";
import { notifyResultConfirmed, notifyResultSubmitted } from "@/lib/resultNotifications";

// POST: submit a clan match result.
// A result submitted by a player stays pending until a player on the other
// side confirms it (POST /api/clans/matches/confirm). A clan admin's
// submission is confirmed immediately.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const data = await req.json();
  const { clanId } = data;
  if (!clanId) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  const entry = parseMatchEntry(data);
  if (typeof entry === "string") return NextResponse.json({ error: entry }, { status: 400 });
  const { matchType, team1, team2, scoreDetails } = entry;
  const score = scoreDetails.score;
  const players = [...team1, ...team2];

  const admin = await isClanAdmin(uid, clanId);
  if (!admin && (!players.includes(uid) || !(await isClanMember(uid, clanId)))) {
    return forbidden("Only players in this match or a clan admin can submit its result");
  }
  if (!(await areClanMembers(clanId, players))) {
    return NextResponse.json({ error: "All players must be members of this clan" }, { status: 400 });
  }

  const winner = determineWinner(score);
  const connection = await createConnection();

  try {
    const series_id = data.series_id || null;
    if (series_id) {
      const [series] = await connection.execute<RowDataPacket[]>(
        `SELECT series_type FROM InternalSeries WHERE series_id = ? AND clan_id = ? AND end_date IS NULL`,
        [series_id, clanId]
      );
      if (!series.length) {
        return NextResponse.json({ error: "Series not found or already finished" }, { status: 400 });
      }
      if (series[0].series_type !== matchType) {
        return NextResponse.json({ error: `This is a ${series[0].series_type} series` }, { status: 400 });
      }
    }

    await connection.beginTransaction();

    try {
      const submissionId = await insertSubmission(connection, clanId, entry, uid, {
        seriesId: series_id, entryMethod: admin ? "admin" : "player",
      });

      let status = "pending";
      let matchId: number | null = null;
      let pointsAwarded = 0;
      let ratingChanges: Record<string, number> = {};

      if (admin) {
        const submission = await loadSubmission(connection, submissionId);
        const result = await finalizeSubmission(connection, submission!, uid);
        status = "confirmed";
        matchId = result.matchId;
        pointsAwarded = result.points;
        ratingChanges = Object.fromEntries(Object.entries(result.ratingChanges).map(([u, d]) => [u, Math.round(d)]));
      }

      await connection.commit();

      const submission = await loadSubmission(connection, submissionId);
      if (submission) {
        if (status === "confirmed") {
          await notifyResultConfirmed(submission, uid);
          await notifyOvertakes(clanId, [{ source: matchType === "singles" ? "clan_singles" : "clan_doubles", matchId: matchId! }]);
        } else await notifyResultSubmitted(submission);
      }

      return NextResponse.json({
        success: true,
        message: status === "confirmed"
          ? "Match recorded and leaderboard updated"
          : "Result submitted — waiting for the other side to confirm",
        status,
        submissionId: submissionId,
        matchId,
        // "player1" / "player2" (team1 / team2) for compatibility with existing clients
        winner: winner === "team1" ? "player1" : winner === "team2" ? "player2" : null,
        pointsAwarded,
        ratingChanges,
      }, { status: 201 });

    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    console.error("Error recording match:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record match" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
