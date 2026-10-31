import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { createConnection } from '@/lib/db'; // Import the createConnection function
import { getUserFromRequest, unauthorized } from "@/lib/auth";

// Interface for raw database singles match results
interface SinglesMatchRow extends RowDataPacket {
  match_id: string;
  clan_id: string;
  series_id: string;
  player_1_name: string;
  player_2_name: string;
  player_1: string;
  player_2: string;
  winner_player: string | null;
  score_details: string;
  match_date: Date;
}

// Interface for raw database doubles match results
interface DoublesMatchRow extends RowDataPacket {
  match_id: string;
  clan_id: string;
  series_id: string;
  team1_player1_name: string;
  team1_player2_name: string;
  team2_player1_name: string;
  team2_player2_name: string;
  team1_player1: string;
  team1_player2: string;
  team2_player1: string;
  team2_player2: string;
  winner_team: string | null;
  score_details: string;
  match_date: Date;
}

// Interface for score details - updated to match frontend expectations
interface ScoreDetails {
  team1: number[];
  team2: number[];
}
interface ScoreObject {
  scores?: Array<{team1: number, team2: number}>;
  score?: string;
}
// Interface for formatted match data
interface FormattedMatch {
  id: string;
  type: 'singles' | 'doubles';
  status: 'scheduled' | 'live' | 'completed';
  players: {
    team1: string[];
    team2: string[];
  };
  playerIds: {
    team1: string[];
    team2: string[];
  };
  scores: ScoreDetails;
  winner: string | null;
  matchDate: Date;
  seriesId: string;
}

// Helper function to safely parse score details
function parseScoreDetails(scoreDetails: string): ScoreDetails {
  // Print raw value for debugging
  console.log("Raw score details:", scoreDetails);
  
  try {
    // Default empty structure
    const result: ScoreDetails = {
      team1: [],
      team2: []
    };

    let parsedScores: Array<{team1: number, team2: number}> = [];
    
    // Handle the case where scoreDetails might be an object already
    if (typeof scoreDetails === 'object') {
      const objDetails = scoreDetails as ScoreObject;

      // Check if it has the scores array
      if (Array.isArray(objDetails.scores)) {
        parsedScores = objDetails.scores;
      }
      
      // Check if it has score property
      else if (objDetails.score && typeof objDetails.score === 'string') {
        const scoresSplit = objDetails.score.split(', ');
        parsedScores = scoresSplit.map((scoreStr: string) => {
          const [team1Score, team2Score] = scoreStr.split('-').map(Number);
          return { team1: team1Score, team2: team2Score };
        });
      }
    } else {
      // Regular parsing attempt
      try {
        const parsed = JSON.parse(scoreDetails);
        
        // Check if it has the scores array
        if (Array.isArray(parsed.scores)) {
          parsedScores = parsed.scores;
        }
        
        // Check if it has score property
        else if (parsed.score && typeof parsed.score === 'string') {
          const scoresSplit = parsed.score.split(', ');
          parsedScores = scoresSplit.map((scoreStr: string) => {
            const [team1Score, team2Score] = scoreStr.split('-').map(Number);
            return { team1: team1Score, team2: team2Score };
          });
        }
      } catch (firstError) {
        console.log(firstError);
        // If it's already a string in the format "21-19, 15-21, 21-18"
        if (scoreDetails.includes('-') && scoreDetails.includes(', ')) {
          const scoresSplit = scoreDetails.split(', ');
          parsedScores = scoresSplit.map((scoreStr: string) => {
            const [team1Score, team2Score] = scoreStr.split('-').map(Number);
            return { team1: team1Score, team2: team2Score };
          });
        }
        
        // Try removing any escaped quotes that might be causing issues
        else {
          try {
            const cleanedString = scoreDetails.replace(/\\"/g, '"');
            const parsed = JSON.parse(cleanedString);
            
            if (Array.isArray(parsed.scores)) {
              parsedScores = parsed.scores;
            }
            else if (parsed.score && typeof parsed.score === 'string') {
              const scoresSplit = parsed.score.split(', ');
              parsedScores = scoresSplit.map((scoreStr: string) => {
                const [team1Score, team2Score] = scoreStr.split('-').map(Number);
                return { team1: team1Score, team2: team2Score };
              });
            }
          } catch (secondError) {
            console.log(secondError);
            // If that still fails, try to extract values using regex
            // Looking for pattern like {\"score\": \"21-19, 15-21, 21-18\"}
            const scoreMatch = /score\":\s*\"([^\"]+)\"/.exec(scoreDetails);
            if (scoreMatch && scoreMatch[1]) {
              const scoreString = scoreMatch[1];
              const scoresSplit = scoreString.split(', ');
              parsedScores = scoresSplit.map((scoreStr: string) => {
                const [team1Score, team2Score] = scoreStr.split('-').map(Number);
                return { team1: team1Score, team2: team2Score };
              });
            }
            else {
              // If all fails, log and return empty
              console.error("Failed to parse score details after multiple attempts:", scoreDetails);
            }
          }
        }
      }
    }
    
    // Transform the array of objects to object of arrays format
    if (parsedScores.length > 0) {
      result.team1 = parsedScores.map(score => score.team1);
      result.team2 = parsedScores.map(score => score.team2);
    }
    
    console.log("Processed score details:", result);
    return result;
  } catch (error) {
    console.error("Error parsing score details:", error);
    console.error("Problematic data:", scoreDetails);
    return { team1: [], team2: [] };
  }
}

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("id");
    console.log("Fetching matches for clan ID:", clanId);

    if (!clanId) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }
    
    // Fetch singles matches
    const [singlesMatches] = await connection.execute<SinglesMatchRow[]>(`
      SELECT 
        ism.match_id, 
        ism.clan_id,
        ism.series_id,
        u1.name as player_1_name,
        u2.name as player_2_name,
        ism.player_1,
        ism.player_2,
        ism.winner_player,
        ism.score_details,
        ism.match_date
      FROM InternalSinglesMatches ism
      LEFT JOIN Users u1 ON ism.player_1 = u1.user_id
      LEFT JOIN Users u2 ON ism.player_2 = u2.user_id
      WHERE ism.clan_id = ?
      ORDER BY ism.match_date DESC
    `, [clanId]);
    
    // Fetch doubles matches
    const [doublesMatches] = await connection.execute<DoublesMatchRow[]>(`
      SELECT 
        idm.match_id, 
        idm.clan_id,
        idm.series_id,
        u1.name as team1_player1_name,
        u2.name as team1_player2_name,
        u3.name as team2_player1_name,
        u4.name as team2_player2_name,
        idm.team1_player1,
        idm.team1_player2,
        idm.team2_player1,
        idm.team2_player2,
        idm.winner_team,
        idm.score_details,
        idm.match_date
      FROM InternalDoublesMatches idm
      LEFT JOIN Users u1 ON idm.team1_player1 = u1.user_id
      LEFT JOIN Users u2 ON idm.team1_player2 = u2.user_id
      LEFT JOIN Users u3 ON idm.team2_player1 = u3.user_id
      LEFT JOIN Users u4 ON idm.team2_player2 = u4.user_id
      WHERE idm.clan_id = ?
      ORDER BY idm.match_date DESC
    `, [clanId]);
    
    
    // Transform the singles matches data
    const formattedSinglesMatches = singlesMatches.map((match: SinglesMatchRow): FormattedMatch => {
      // Safely parse the score details
      const scoreDetails = parseScoreDetails(match.score_details);
      
      // Determine status based on winner or date
      let status: 'scheduled' | 'live' | 'completed' = 'scheduled';
      if (match.winner_player) {
        status = 'completed';
      } else if (new Date(match.match_date) <= new Date()) {
        status = 'live';
      }
      
      return {
        id: match.match_id,
        type: 'singles',
        status,
        players: {
          team1: [match.player_1_name],
          team2: [match.player_2_name]
        },
        playerIds: {
          team1: [match.player_1],
          team2: [match.player_2]
        },
        scores: scoreDetails,
        winner: match.winner_player,
        matchDate: match.match_date,
        seriesId: match.series_id
      };
    });
    
    // Transform the doubles matches data
    const formattedDoublesMatches = doublesMatches.map((match: DoublesMatchRow): FormattedMatch => {
      // Safely parse the score details
      const scoreDetails = parseScoreDetails(match.score_details);
      
      // Determine status based on winner or date
      let status: 'scheduled' | 'live' | 'completed' = 'scheduled';
      if (match.winner_team) {
        status = 'completed';
      } 
      
      return {
        id: match.match_id,
        type: 'doubles',
        status,
        players: {
          team1: [match.team1_player1_name, match.team1_player2_name],
          team2: [match.team2_player1_name, match.team2_player2_name]
        },
        playerIds: {
          team1: [match.team1_player1, match.team1_player2],
          team2: [match.team2_player1, match.team2_player2]
        },
        scores: scoreDetails,
        winner: match.winner_team,
        matchDate: match.match_date,
        seriesId: match.series_id
      };
    });
    
    // Combine all matches and sort by date
    const allMatches = [...formattedSinglesMatches, ...formattedDoublesMatches]
      .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
    
    return NextResponse.json({ 
      success: true, 
      data: {
        singles: formattedSinglesMatches,
        doubles: formattedDoublesMatches,
        all: allMatches
      } 
    }, { status: 200 });
    
  } catch (error) {
    console.error("❌ MySQL Fetch Error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  } finally {
    // Always close the connection
    await connection.end();
  }
}