import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

function getStageName(matchCount: number, roundNumber: number, position: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return `Semi Final - Match ${position + 1}`;
  if (matchCount === 4) return `Quarter Final - Match ${position + 1}`;
  return `Round ${roundNumber} - Match ${position + 1}`;
}

function calcPoints(scoreDetails: string | null | undefined): number {
  if (!scoreDetails) return 5;
  // score_details arrives as JSON: {"score":"21-10, 21-15","games":[...]}
  let scoreStr = String(scoreDetails);
  try {
    const parsed = JSON.parse(scoreStr);
    if (parsed?.score) scoreStr = parsed.score;
  } catch { /* plain string fallback */ }

  // Net signed diff across all games — loser's wins reduce the margin
  // "21-10, 15-21, 21-18" → (21-10) + (15-21) + (21-18) = 11 - 6 + 3 = 8
  const games = scoreStr.split(',');
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
    await connection.beginTransaction();

    const { tournamentId, matchId, winner_team_id, score_details, team1_players, team2_players } = await req.json();

    if (!tournamentId || !matchId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // Serialize player selections if provided
    const t1Players = Array.isArray(team1_players) ? JSON.stringify(team1_players) : null;
    const t2Players = Array.isArray(team2_players) ? JSON.stringify(team2_players) : null;

    // Update match score, winner, and player selections
    await connection.execute(
      `UPDATE TournamentMatches
       SET winner_team_id = ?, score_details = ?,
           team1_players = COALESCE(?, team1_players),
           team2_players = COALESCE(?, team2_players)
       WHERE match_id = ? AND tournament_id = ?`,
      [winner_team_id ?? null, score_details ?? null, t1Players, t2Players, matchId, tournamentId]
    );

    // Fetch tournament metadata
    const [tournRows] = await connection.execute<RowDataPacket[]>(
      `SELECT clan_id, format, tournament_type FROM Tournaments WHERE tournament_id = ?`,
      [tournamentId]
    );
    const format: string          = tournRows[0]?.format ?? "";
    const clanId: number          = tournRows[0]?.clan_id;
    const tournType: string       = tournRows[0]?.tournament_type ?? "singles"; // "singles" | "doubles"
    const ptsCol: string          = tournType === "doubles" ? "doubles_points" : "singles_points";

    // ── Leaderboard update (fires whenever a winner is declared and players are known) ──
    if (winner_team_id && Array.isArray(team1_players) && Array.isArray(team2_players) && clanId) {
      const [mInfo] = await connection.execute<RowDataPacket[]>(
        `SELECT team1_id FROM TournamentMatches WHERE match_id = ?`,
        [matchId]
      );
      const team1Id = mInfo[0]?.team1_id;
      const isTeam1Winner = winner_team_id === team1Id;
      // Frontend sends plain string user-id arrays e.g. ["uid1", "uid2"]
      const winningPlayers: string[] = isTeam1Winner ? team1_players : team2_players;
      const losingPlayers:  string[] = isTeam1Winner ? team2_players : team1_players;
      const pts = calcPoints(score_details);

      for (const userId of winningPlayers) {
        if (!userId) continue;
        await connection.execute(
          `UPDATE ClanLeaderboard
           SET clan_points   = clan_points + ?,
               ${ptsCol}     = ${ptsCol} + ?,
               matchesplayed = matchesplayed + 1,
               matcheswon    = matcheswon + 1,
               last_updated  = CURRENT_TIMESTAMP
           WHERE clan_id = ? AND user_id = ?`,
          [pts, pts, clanId, userId]
        );
      }
      for (const userId of losingPlayers) {
        if (!userId) continue;
        await connection.execute(
          `UPDATE ClanLeaderboard
           SET clan_points   = GREATEST(clan_points - ?, 0),
               ${ptsCol}     = GREATEST(${ptsCol} - ?, 0),
               matchesplayed = matchesplayed + 1,
               matcheslost   = matcheslost + 1,
               last_updated  = CURRENT_TIMESTAMP
           WHERE clan_id = ? AND user_id = ?`,
          [pts, pts, clanId, userId]
        );
      }
    }

    // Advance bracket for knockout and group_knockout knockout phase
    if (winner_team_id && (format === "knockout" || format === "group_knockout" || format === "round_robin")) {
      const [matchRows] = await connection.execute<RowDataPacket[]>(
        `SELECT round_number, phase FROM TournamentMatches WHERE match_id = ?`,
        [matchId]
      );

      if (matchRows.length > 0) {
        const { round_number, phase } = matchRows[0];

        // For group_knockout and round_robin, only advance bracket in the knockout phase
        if ((format === "group_knockout" || format === "round_robin") && phase !== "knockout") {
          await connection.commit();
          return NextResponse.json({ success: true });
        }

        const [pending] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM TournamentMatches
           WHERE tournament_id = ? AND round_number = ? AND winner_team_id IS NULL`,
          [tournamentId, round_number]
        );

        if (pending[0].cnt === 0) {
          const [roundMatches] = await connection.execute<RowDataPacket[]>(
            `SELECT winner_team_id, match_position FROM TournamentMatches
             WHERE tournament_id = ? AND round_number = ?
             ORDER BY match_position ASC`,
            [tournamentId, round_number]
          );

          if (roundMatches.length > 1) {
            const nextRound = round_number + 1;
            const nextMatchCount = Math.floor(roundMatches.length / 2);

            for (let i = 0; i < roundMatches.length; i += 2) {
              const team1 = roundMatches[i].winner_team_id;
              const team2 = roundMatches[i + 1]?.winner_team_id ?? null;
              const pos = Math.floor(i / 2);
              const stageName = getStageName(nextMatchCount, nextRound, pos);

              await connection.execute<ResultSetHeader>(
                `INSERT INTO TournamentMatches
                 (tournament_id, team1_id, team2_id, match_stage, round_number, match_position, phase)
                 VALUES (?, ?, ?, ?, ?, ?, 'knockout')`,
                [tournamentId, team1, team2, stageName, nextRound, pos]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating tournament match:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update match" },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
