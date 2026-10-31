import { NextRequest, NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const uid = await getUserFromRequest(request);
  if (!uid) return unauthorized();

  try {
    const { clanId, matchResult } = await request.json();
    
    if (!clanId || !matchResult) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const { winner, team1Players, team2Players, score } = matchResult;
    
    if (!winner || !team1Players || !team2Players || !score) {
      return NextResponse.json(
        { success: false, error: "Invalid match result data - missing winner, players, or score" },
        { status: 400 }
      );
    }

    const connection = await createConnection();
    
    try {
      await connection.beginTransaction();
      
      // Calculate score difference and points
      let scoreDifference = 0;
      let pointsToAward = 0;
      
      // Parse the score (assuming format like "11-5" or "21-15")
      const scoreMatch = score.match(/(\d+)-(\d+)/);
      if (!scoreMatch) {
        return NextResponse.json(
          { success: false, error: "Invalid score format. Expected format: '11-5'" },
          { status: 400 }
        );
      }
      
      const score1 = parseInt(scoreMatch[1]);
      const score2 = parseInt(scoreMatch[2]);
      
      // Determine winning and losing players
      let winningPlayers: string[] = [];
      let losingPlayers: string[] = [];
      
      if (winner === "player1" || winner === "team1") {
        winningPlayers = team1Players;
        losingPlayers = team2Players;
        scoreDifference = score1 - score2;
      } else if (winner === "player2" || winner === "team2") {
        winningPlayers = team2Players;
        losingPlayers = team1Players;
        scoreDifference = score2 - score1;
      } else {
        // In case of draw, just update matches played
        const allPlayers = [...team1Players, ...team2Players];
        for (const playerId of allPlayers) {
          if (playerId) {
            await connection.execute(
              `UPDATE ClanLeaderboard 
               SET matchesplayed = matchesplayed + 1,
                   last_updated = CURRENT_TIMESTAMP 
               WHERE clan_id = ? AND user_id = ?`,
              [clanId, playerId]
            );
          }
        }
        await connection.commit();
        return NextResponse.json({ success: true, message: "Match was a draw, only matches played updated" });
      }
      
      // Calculate points using the formula: 2.5 + (score difference/10)*2
      pointsToAward = 2.5 + (scoreDifference / 10) * 2;
      
      
      // Update stats for winning players
      for (const playerId of winningPlayers) {
        if (playerId) {
          await connection.execute(
            `UPDATE ClanLeaderboard 
             SET clan_points = clan_points + ?,
                 matchesplayed = matchesplayed + 1,
                 matcheswon = matcheswon + 1,
                 last_updated = CURRENT_TIMESTAMP 
             WHERE clan_id = ? AND user_id = ?`,
            [pointsToAward, clanId, playerId]
          );
        }
      }
      
      // Update stats for losing players
      for (const playerId of losingPlayers) {
        if (playerId) {
          await connection.execute(
            `UPDATE ClanLeaderboard 
             SET clan_points = GREATEST(clan_points - ?, 0),
                 matchesplayed = matchesplayed + 1,
                 matcheslost = matcheslost + 1,
                 last_updated = CURRENT_TIMESTAMP 
             WHERE clan_id = ? AND user_id = ?`,
            [pointsToAward, clanId, playerId]
          );
        }
      }
      
      await connection.commit();
      
      return NextResponse.json({ 
        success: true, 
        message: "Leaderboard updated successfully",
        pointsAwarded: pointsToAward,
        scoreDifference: scoreDifference,
        formula: `2.5 + (${scoreDifference}/10)*2 = ${pointsToAward}`
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
    
  } catch (error) {
    console.error("Error updating leaderboard:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to update leaderboard",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}