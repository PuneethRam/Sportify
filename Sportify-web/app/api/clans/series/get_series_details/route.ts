import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

interface SeriesRow {
  series_id: string; clan_id: string; series_type: "singles" | "doubles";
  team1_name: string; team2_name: string; total_matches: number;
  winner_team: string; start_date: Date; end_date: Date;
  Team1_players: string; Team2_players: string;
}

interface ScoreDetails {
  score: string; team1Score?: number; team2Score?: number;
  team1Players?: string[]; team2Players?: string[];
}

interface SinglesMatchRow {
  match_id: string; clan_id: string; series_id: string;
  player_1: string; player_2: string; winner_player: string;
  score_details: string; match_date: Date;
}

interface DoublesMatchRow {
  match_id: string; clan_id: string; series_id: string;
  team1_player1: string; team1_player2: string;
  team2_player1: string; team2_player2: string;
  winner_team: string; score_details: string; match_date: Date;
}

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const clanId   = searchParams.get("clanId");
    const seriesId = searchParams.get("seriesId");

    if (!clanId || !seriesId) {
      return NextResponse.json(
        { success: false, error: "Clan ID and Series ID are required" },
        { status: 400 }
      );
    }

    const seriesRows = await executeQuery(
      `SELECT series_id, clan_id, series_type, team1_name, team2_name,
              total_matches, winner_team, start_date, end_date, Team1_players, Team2_players
       FROM InternalSeries WHERE clan_id = ? AND series_id = ?`,
      [clanId, seriesId]
    ) as SeriesRow[];

    if (!seriesRows.length) {
      return NextResponse.json({ success: false, error: "Series not found" }, { status: 404 });
    }

    const series = seriesRows[0];
    const parsePlayers = (v: string | unknown): unknown[] =>
      typeof v === "string" ? (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })() : ((v as unknown[]) || []);
    const team1Players = parsePlayers(series.Team1_players);
    const team2Players = parsePlayers(series.Team2_players);

    type MatchResponse = {
      match_id: string; team1Score: number; team2Score: number;
      scoreDetails: { score: string; team1Players: string[]; team2Players: string[] };
      match_date: Date; winner: "player1" | "player2" | "draw";
    };

    let matches: MatchResponse[] = [];

    if (series.series_type === "singles") {
      const matchRows = await executeQuery(
        `SELECT match_id, clan_id, series_id, player_1, player_2,
                winner_player, score_details, match_date
         FROM InternalSinglesMatches WHERE clan_id = ? AND series_id = ?`,
        [clanId, seriesId]
      ) as SinglesMatchRow[];

      matches = matchRows.map(m => {
        const sd: ScoreDetails = (() => { try { return JSON.parse(m.score_details || "{}"); } catch { return {}; } })();
        return {
          match_id: m.match_id,
          team1Score: sd.team1Score || 0,
          team2Score: sd.team2Score || 0,
          scoreDetails: { score: sd.score || "", team1Players: [m.player_1], team2Players: [m.player_2] },
          match_date: m.match_date,
          winner: m.winner_player === m.player_1 ? "player1" : m.winner_player === m.player_2 ? "player2" : "draw",
        };
      });
    } else {
      const matchRows = await executeQuery(
        `SELECT match_id, clan_id, series_id,
                team1_player1, team1_player2, team2_player1, team2_player2,
                winner_team, score_details, match_date
         FROM InternalDoublesMatches WHERE clan_id = ? AND series_id = ?`,
        [clanId, seriesId]
      ) as DoublesMatchRow[];

      matches = matchRows.map(m => {
        const sd: ScoreDetails = (() => { try { return JSON.parse(m.score_details || "{}"); } catch { return {}; } })();
        return {
          match_id: m.match_id,
          team1Score: sd.team1Score || 0,
          team2Score: sd.team2Score || 0,
          scoreDetails: {
            score: sd.score || "",
            team1Players: [m.team1_player1, m.team1_player2],
            team2Players: [m.team2_player1, m.team2_player2],
          },
          match_date: m.match_date,
          winner: m.winner_team === "team1" ? "player1" : m.winner_team === "team2" ? "player2" : "draw",
        };
      });
    }

    return NextResponse.json({
      success: true,
      series: {
        series_id:    series.series_id,
        clan_id:      series.clan_id,
        series_type:  series.series_type,
        team1_name:   series.team1_name,
        team2_name:   series.team2_name,
        total_matches: series.total_matches,
        winner_team:  series.winner_team,
        start_date:   series.start_date,
        end_date:     series.end_date,
        Team1_players: team1Players,
        Team2_players: team2Players,
      },
      matches,
    });
  } catch (error) {
    console.error("Error fetching series details:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
