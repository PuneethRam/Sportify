import { createConnection } from '@/lib/db';
import { NextResponse } from "next/server";
import { ResultSetHeader } from 'mysql2';
import { getUserFromRequest, unauthorized } from "@/lib/auth";

function determineWinner(score: string): "player1" | "player2" | null {
  const sets = score.split(',').map(s => s.trim());
  let p1Wins = 0, p2Wins = 0;

  for (const set of sets) {
    const [s1, s2] = set.split('-').map(n => parseInt(n.trim(), 10));
    if (isNaN(s1) || isNaN(s2)) continue;
    if (s1 > s2) p1Wins++;
    else if (s2 > s1) p2Wins++;
  }

  if (p1Wins > p2Wins) return "player1";
  if (p2Wins > p1Wins) return "player2";
  return null;
}

function calcPoints(score: string): number {
  // Net signed diff across all games — same formula as tournament matches
  const games = score.split(',');
  let netDiff = 0, gameCount = 0;
  for (const g of games) {
    const m = /(\d+)-(\d+)/.exec(g.trim());
    if (m) { netDiff += parseInt(m[1]) - parseInt(m[2]); gameCount++; }
  }
  if (gameCount === 0) return 5;
  return 5 + (Math.abs(netDiff) / 10) * 2;
}

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const data = await req.json();
    const { matchType, clanId, scoreDetails } = data;

    if (!matchType || !clanId || !scoreDetails) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const score = scoreDetails.score;
    if (!score) {
      return NextResponse.json({ error: "Score is required" }, { status: 400 });
    }

    const winner = determineWinner(score);
    const points = calcPoints(score);
    const scoreDetailsJson = JSON.stringify(scoreDetails);
    const series_id = data.series_id || null;

    let team1Players: string[] = [];
    let team2Players: string[] = [];
    let matchResult: ResultSetHeader;

    await connection.beginTransaction();

    try {
      if (matchType === "singles") {
        const { player1, player2 } = data;
        if (!player1 || !player2) {
          await connection.rollback();
          return NextResponse.json({ error: "Missing player information" }, { status: 400 });
        }

        team1Players = [player1];
        team2Players = [player2];
        const winnerPlayer = winner === "player1" ? player1 : winner === "player2" ? player2 : null;

        [matchResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO InternalSinglesMatches
           (clan_id, player_1, player_2, score_details, winner_player, series_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [clanId, player1, player2, scoreDetailsJson, winnerPlayer, series_id]
        );

      } else if (matchType === "doubles") {
        const { team1Player1, team1Player2, team2Player1, team2Player2 } = data;
        if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
          await connection.rollback();
          return NextResponse.json({ error: "Missing player information" }, { status: 400 });
        }

        team1Players = [team1Player1, team1Player2];
        team2Players = [team2Player1, team2Player2];
        const winnerTeam = winner === "player1" ? "team1" : winner === "player2" ? "team2" : null;

        [matchResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO InternalDoublesMatches
           (clan_id, team1_player1, team1_player2, team2_player1, team2_player2, score_details, winner_team, series_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [clanId, team1Player1, team1Player2, team2Player1, team2Player2, scoreDetailsJson, winnerTeam, series_id]
        );

      } else {
        await connection.rollback();
        return NextResponse.json({ error: "Invalid match type" }, { status: 400 });
      }

      // ── Leaderboard update in the same transaction ──────────────────
      if (winner === null) {
        // Draw — just increment matchesplayed for everyone
        for (const playerId of [...team1Players, ...team2Players]) {
          if (playerId) {
            await connection.execute(
              `UPDATE ClanLeaderboard
               SET matchesplayed = matchesplayed + 1, last_updated = CURRENT_TIMESTAMP
               WHERE clan_id = ? AND user_id = ?`,
              [clanId, playerId]
            );
          }
        }
      } else {
        const winningPlayers = winner === "player1" ? team1Players : team2Players;
        const losingPlayers  = winner === "player1" ? team2Players : team1Players;

        const ptsCol = matchType === "singles" ? "singles_points" : "doubles_points";

        for (const playerId of winningPlayers) {
          if (playerId) {
            await connection.execute(
              `UPDATE ClanLeaderboard
               SET clan_points   = clan_points + ?,
                   ${ptsCol}     = ${ptsCol} + ?,
                   matchesplayed = matchesplayed + 1,
                   matcheswon    = matcheswon + 1,
                   last_updated  = CURRENT_TIMESTAMP
               WHERE clan_id = ? AND user_id = ?`,
              [points, points, clanId, playerId]
            );
          }
        }

        for (const playerId of losingPlayers) {
          if (playerId) {
            await connection.execute(
              `UPDATE ClanLeaderboard
               SET clan_points   = GREATEST(clan_points - ?, 0),
                   ${ptsCol}     = GREATEST(${ptsCol} - ?, 0),
                   matchesplayed = matchesplayed + 1,
                   matcheslost   = matcheslost + 1,
                   last_updated  = CURRENT_TIMESTAMP
               WHERE clan_id = ? AND user_id = ?`,
              [points, points, clanId, playerId]
            );
          }
        }
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: "Match recorded and leaderboard updated",
        matchId: matchResult!.insertId,
        winner,
        pointsAwarded: winner ? points : 0
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
