import { createConnection } from '@/lib/db'; // Import the connection creator
import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const body = await req.json();
    const { clanId, seriesId } = body;

    if (!clanId || !seriesId) {
      return NextResponse.json({ 
        success: false, 
        error: "Clan ID and Series ID are required" 
      }, { status: 400 });
    }

    const connection = await createConnection();

    try {
      // First get the series details to determine type (singles or doubles)
      const [seriesRows] = await connection.execute(
        `SELECT series_type, team1_name, team2_name FROM InternalSeries WHERE series_id = ? AND clan_id = ?`,
        [seriesId, clanId]
      );
      
      if (!Array.isArray(seriesRows) || seriesRows.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "Series not found" 
        }, { status: 404 });
      }
      
      const series = seriesRows[0] as { series_type: 'singles' | 'doubles', team1_name: string, team2_name: string };
      let team1Wins = 0;
      let team2Wins = 0;
      let totalMatches = 0;
      
      // Get match results based on series type
      if (series.series_type === 'singles') {
        const [matchRows] = await connection.execute(
          `SELECT winner_player, player_1, player_2 FROM InternalsinglesMatches 
           WHERE series_id = ? AND clan_id = ?`,
          [seriesId, clanId]
        );
        
        if (Array.isArray(matchRows) && matchRows.length > 0) {
          totalMatches = matchRows.length;
          
          // Count wins for each team
          for (const match of matchRows as { winner_player: string, player_1: string, player_2: string }[]) {
            if (match.winner_player === match.player_1) {
              team1Wins++;
            } else if (match.winner_player === match.player_2) {
              team2Wins++;
            }
          }
        }
      } else {
        // For doubles matches
        const [matchRows] = await connection.execute(
          `SELECT winner_team FROM InternalDoublesMatches 
           WHERE series_id = ? AND clan_id = ?`,
          [seriesId, clanId]
        );
        
        if (Array.isArray(matchRows) && matchRows.length > 0) {
          totalMatches = matchRows.length;
          
          // Count wins for each team
          for (const match of matchRows as { winner_team: 'team1' | 'team2' }[]) {
            if (match.winner_team === 'team1') {
              team1Wins++;
            } else if (match.winner_team === 'team2') {
              team2Wins++;
            }
          }
        }
      }
      
      if (totalMatches === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "No matches found for this series" 
        }, { status: 400 });
      }
      
      // Determine overall winner
      let winnerTeam = null;
      if (team1Wins > team2Wins) {
        winnerTeam = series.team1_name;
      } else if (team2Wins > team1Wins) {
        winnerTeam = series.team2_name;
      } else {
        winnerTeam = "Draw"; // In case of a tie
      }
      
      // Update the series record with the winner and end date
      await connection.execute(
        `UPDATE InternalSeries 
         SET winner_team = ?, total_matches = ?, end_date = NOW()
         WHERE series_id = ? AND clan_id = ?`,
        [winnerTeam, totalMatches, seriesId, clanId]
      );
      
      return NextResponse.json({ 
        success: true,
        message: "Series completed successfully",
        data: {
          totalMatches,
          team1Wins,
          team2Wins,
          winner: winnerTeam
        }
      }, { status: 200 });

    } finally {
      await connection.end();
    }
    
  } catch (error) {
    console.error("❌ Finish Series Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}