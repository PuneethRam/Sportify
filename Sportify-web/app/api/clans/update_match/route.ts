import { createConnection } from '@/lib/db';
import { NextResponse } from "next/server";
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { areClanMembers, forbidden, isClanAdmin, isClanMember } from "@/lib/authz";
import { determineWinner, parseGames } from "@/lib/scoring";
import { finalizeSubmission, loadSubmission } from "@/lib/matchSubmissions";
import { notifyResultConfirmed, notifyResultSubmitted } from "@/lib/resultNotifications";

// POST: submit a clan match result.
// A result submitted by a player stays pending until a player on the other
// side confirms it (POST /api/clans/matches/confirm). A clan admin's
// submission is confirmed immediately.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const data = await req.json();
  const { matchType, clanId, scoreDetails } = data;

  if (!matchType || !clanId || !scoreDetails) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const score = scoreDetails.score;
  if (!score || !parseGames(score).length) {
    return NextResponse.json({ error: "Score is required, e.g. \"21-15, 21-18\"" }, { status: 400 });
  }

  let team1: string[];
  let team2: string[];
  if (matchType === "singles") {
    team1 = [data.player1];
    team2 = [data.player2];
  } else if (matchType === "doubles") {
    team1 = [data.team1Player1, data.team1Player2];
    team2 = [data.team2Player1, data.team2Player2];
  } else {
    return NextResponse.json({ error: "Invalid match type" }, { status: 400 });
  }

  const players = [...team1, ...team2];
  if (players.some(p => !p || typeof p !== "string")) {
    return NextResponse.json({ error: "Missing player information" }, { status: 400 });
  }
  if (new Set(players).size !== players.length) {
    return NextResponse.json({ error: "A player can only appear once in a match" }, { status: 400 });
  }

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
      const [ins] = await connection.execute<ResultSetHeader>(
        `INSERT INTO MatchSubmissions
         (clan_id, match_type, series_id, team1_player1, team1_player2, team2_player1, team2_player2,
          score_details, winner, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clanId, matchType, series_id, team1[0], team1[1] ?? null, team2[0], team2[1] ?? null,
         JSON.stringify(scoreDetails), winner, uid]
      );

      let status = "pending";
      let matchId: number | null = null;
      let pointsAwarded = 0;

      if (admin) {
        const submission = await loadSubmission(connection, ins.insertId);
        const result = await finalizeSubmission(connection, submission!, uid);
        status = "confirmed";
        matchId = result.matchId;
        pointsAwarded = result.points;
      }

      await connection.commit();

      const submission = await loadSubmission(connection, ins.insertId);
      if (submission) {
        if (status === "confirmed") await notifyResultConfirmed(submission, uid);
        else await notifyResultSubmitted(submission);
      }

      return NextResponse.json({
        success: true,
        message: status === "confirmed"
          ? "Match recorded and leaderboard updated"
          : "Result submitted — waiting for the other side to confirm",
        status,
        submissionId: ins.insertId,
        matchId,
        // "player1" / "player2" (team1 / team2) for compatibility with existing clients
        winner: winner === "team1" ? "player1" : winner === "team2" ? "player2" : null,
        pointsAwarded,
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
