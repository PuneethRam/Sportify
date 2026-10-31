import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("clanId");

    if (!clanId) {
      return NextResponse.json({ error: "clanId is required" }, { status: 400 });
    }

    // Try the full query with singles_points / doubles_points columns.
    // If those columns don't exist yet (migration not run), fall back to the
    // legacy query that returns 0 for those fields.
    let rows: RowDataPacket[];
    try {
      rows = await executeQuery(
        `SELECT
           u.user_id,
           u.name,
           cl.clan_points,
           cl.singles_points,
           cl.doubles_points,
           cl.matchesplayed,
           cl.matcheswon,
           cl.matcheslost,
           COUNT(DISTINCT sm.match_id)                                             AS singles_played,
           SUM(CASE WHEN sm.winner_player = u.user_id THEN 1 ELSE 0 END)         AS singles_won,
           COUNT(DISTINCT dm.match_id)                                             AS doubles_played,
           SUM(CASE
             WHEN (dm.winner_team = 'team1' AND (dm.team1_player1 = u.user_id OR dm.team1_player2 = u.user_id)) THEN 1
             WHEN (dm.winner_team = 'team2' AND (dm.team2_player1 = u.user_id OR dm.team2_player2 = u.user_id)) THEN 1
             ELSE 0 END)                                                           AS doubles_won
         FROM ClanLeaderboard cl
         JOIN Users u ON cl.user_id = u.user_id
         LEFT JOIN InternalSinglesMatches sm
           ON (sm.player_1 = u.user_id OR sm.player_2 = u.user_id) AND sm.clan_id = cl.clan_id
         LEFT JOIN InternalDoublesMatches dm
           ON (dm.team1_player1 = u.user_id OR dm.team1_player2 = u.user_id
               OR dm.team2_player1 = u.user_id OR dm.team2_player2 = u.user_id)
           AND dm.clan_id = cl.clan_id
         WHERE cl.clan_id = ?
         GROUP BY u.user_id, u.name, cl.clan_points, cl.singles_points, cl.doubles_points,
                  cl.matchesplayed, cl.matcheswon, cl.matcheslost
         ORDER BY cl.clan_points DESC`,
        [clanId]
      ) as RowDataPacket[];
    } catch (colErr) {
      // singles_points / doubles_points columns don't exist yet — fall back
      rows = await executeQuery(
        `SELECT
           u.user_id,
           u.name,
           cl.clan_points,
           0                                                                       AS singles_points,
           0                                                                       AS doubles_points,
           cl.matchesplayed,
           cl.matcheswon,
           cl.matcheslost,
           COUNT(DISTINCT sm.match_id)                                             AS singles_played,
           SUM(CASE WHEN sm.winner_player = u.user_id THEN 1 ELSE 0 END)         AS singles_won,
           COUNT(DISTINCT dm.match_id)                                             AS doubles_played,
           SUM(CASE
             WHEN (dm.winner_team = 'team1' AND (dm.team1_player1 = u.user_id OR dm.team1_player2 = u.user_id)) THEN 1
             WHEN (dm.winner_team = 'team2' AND (dm.team2_player1 = u.user_id OR dm.team2_player2 = u.user_id)) THEN 1
             ELSE 0 END)                                                           AS doubles_won
         FROM ClanLeaderboard cl
         JOIN Users u ON cl.user_id = u.user_id
         LEFT JOIN InternalSinglesMatches sm
           ON (sm.player_1 = u.user_id OR sm.player_2 = u.user_id) AND sm.clan_id = cl.clan_id
         LEFT JOIN InternalDoublesMatches dm
           ON (dm.team1_player1 = u.user_id OR dm.team1_player2 = u.user_id
               OR dm.team2_player1 = u.user_id OR dm.team2_player2 = u.user_id)
           AND dm.clan_id = cl.clan_id
         WHERE cl.clan_id = ?
         GROUP BY u.user_id, u.name, cl.clan_points, cl.matchesplayed, cl.matcheswon, cl.matcheslost
         ORDER BY cl.clan_points DESC`,
        [clanId]
      ) as RowDataPacket[];
      void colErr; // suppress unused-var warning
    }

    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
