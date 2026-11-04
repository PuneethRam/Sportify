import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { areClanMembers, forbidden, isClanAdmin } from "@/lib/authz";

export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const data = await req.json();
    const { clanId, name, type, totalMatches, Team1_players, Team2players, team1_name, team2_name } = data;

    if (!clanId || !name || !type || !Team1_players || !Team2players) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["singles", "doubles"].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid series type. Must be either "singles" or "doubles"' },
        { status: 400 }
      );
    }

    if (!(await isClanAdmin(uid, clanId))) return forbidden("Only clan admins can create a series");

    const allPlayers = [...(Array.isArray(Team1_players) ? Team1_players : []), ...(Array.isArray(Team2players) ? Team2players : [])]
      .map((p: string | { id?: string; user_id?: string }) => typeof p === "string" ? p : p?.id ?? p?.user_id)
      .filter((p): p is string => !!p);
    if (allPlayers.length && !(await areClanMembers(clanId, allPlayers))) {
      return NextResponse.json({ error: "All players must be members of this clan" }, { status: 400 });
    }

    const team1PlayersJson = Array.isArray(Team1_players) ? JSON.stringify(Team1_players) : Team1_players;
    const team2PlayersJson = Array.isArray(Team2players)  ? JSON.stringify(Team2players)  : Team2players;

    const result = await executeQuery(
      `INSERT INTO InternalSeries
        (clan_id, series_type, series_name, team1_name, team2_name, total_matches, Team1_players, Team2_players)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clanId, type, name, team1_name || "Team 1", team2_name || "Team 2", totalMatches || 0, team1PlayersJson, team2PlayersJson]
    ) as ResultSetHeader;

    return NextResponse.json(
      { success: true, message: "Series created successfully", seriesId: result.insertId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating series:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create series" },
      { status: 500 }
    );
  }
}
