import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Clan ID is required" }, { status: 400 });
    }

    const rows = await executeQuery(
      `SELECT series_id, clan_id, series_type, series_name, team1_name, team2_name,
              total_matches, winner_team, start_date, end_date, Team1_players, Team2_players
       FROM InternalSeries WHERE clan_id = ? ORDER BY start_date DESC`,
      [id]
    ) as {
      series_id: string; clan_id: string; series_type: string; series_name: string;
      team1_name: string; team2_name: string; total_matches: number; winner_team: string;
      start_date: Date; end_date: Date; Team1_players: string; Team2_players: string;
    }[];

    const parsePlayers = (v: string | unknown) =>
      typeof v === "string" ? (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })() : (v || []);

    const data = rows.map(item => ({
      series_id:     item.series_id,
      clan_id:       item.clan_id,
      series_type:   item.series_type,
      series_name:   item.series_name,
      team1_name:    item.team1_name,
      team2_name:    item.team2_name,
      total_matches: item.total_matches,
      winner_team:   item.winner_team,
      start_date:    item.start_date,
      end_date:      item.end_date,
      team1_players: parsePlayers(item.Team1_players),
      team2_players: parsePlayers(item.Team2_players),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching series:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch series" },
      { status: 500 }
    );
  }
}
