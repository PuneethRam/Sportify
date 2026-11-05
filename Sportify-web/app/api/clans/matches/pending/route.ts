import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isClanAdmin, isClanMember } from "@/lib/authz";
import { canResolve, Submission, teamsOf } from "@/lib/matchSubmissions";
import { parseGames } from "@/lib/scoring";

// GET /api/clans/matches/pending?clanId=
// Unconfirmed results in a clan. Members see the ones they play in (with
// canConfirm set when they're on the other side from the submitter); clan
// admins see all of them and can confirm any they didn't play in.
// Tournament results are confirmed on the bracket instead (get_tournament_details).
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const clanId = new URL(req.url).searchParams.get("clanId");
    if (!clanId) return NextResponse.json({ success: false, error: "clanId is required" }, { status: 400 });

    const admin = await isClanAdmin(uid, clanId);
    if (!admin && !(await isClanMember(uid, clanId))) return forbidden();

    const rows = await executeQuery(
      `SELECT * FROM MatchSubmissions
       WHERE clan_id = ? AND status IN ('pending', 'disputed') AND tournament_match_id IS NULL
         ${admin ? "" : "AND ? IN (team1_player1, team1_player2, team2_player1, team2_player2)"}
       ORDER BY submitted_at DESC`,
      admin ? [clanId] : [clanId, uid]
    ) as (Submission & RowDataPacket & { submitted_at: Date })[];

    const ids = [...new Set(rows.flatMap(r => [...teamsOf(r).team1, ...teamsOf(r).team2, r.submitted_by]))];
    const names = new Map<string, string>();
    if (ids.length) {
      const users = await executeQuery(
        `SELECT user_id, name FROM Users WHERE user_id IN (${ids.map(() => "?").join(",")})`,
        ids
      ) as RowDataPacket[];
      users.forEach(u => names.set(u.user_id, u.name));
    }
    const player = (id: string) => ({ id, name: names.get(id) ?? "Unknown" });

    const data = rows.map(r => {
      const { team1, team2 } = teamsOf(r);
      const games = parseGames(r.score_details);
      return {
        matchType:       r.match_type,
        submissionId:    r.submission_id,
        clanId:          r.clan_id,
        seriesId:        r.series_id,
        status:          r.status,
        submittedBy:     r.submitted_by,
        submittedByName: names.get(r.submitted_by) ?? "Unknown",
        score:           games.map(([a, b]) => `${a}-${b}`).join(", "),
        team1Players:    team1.map(player),
        team2Players:    team2.map(player),
        winner:          r.winner,
        submittedAt:     r.submitted_at,
        canConfirm:      canResolve(r, uid, admin),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching pending matches:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch pending results" }, { status: 500 });
  }
}
