import { NextResponse } from "next/server";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { areClanMembers, forbidden, isClanAdmin } from "@/lib/authz";
import { finalizeSubmission, insertSubmission, loadSubmission, MatchEntry, parseMatchEntry } from "@/lib/matchSubmissions";
import { notifyResultConfirmed } from "@/lib/resultNotifications";
import { notifyOvertakes } from "@/lib/seasons";
import { MatchSource } from "@/lib/ratings";

/** Results per request: a full class with a few rounds to spare. */
const MAX_RESULTS = 60;

// POST /api/clans/matches/bulk
// Body: { clanId, matches: [{ matchType, player1, player2 | team1Player1..team2Player2, score }] }
//
// A coach (or any clan admin, or the academy owner) records a batch of
// results from a class in one go. Each goes through the normal
// MatchSubmissions → confirmed path with the coach as submitter and
// resolver (entry_method = 'bulk'), so it counts as confirmed immediately and
// is audited the same way as a single admin entry. All or nothing: if one
// result is invalid, nothing is saved.
export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const { clanId, matches } = await req.json();
  if (!clanId || !Array.isArray(matches) || !matches.length) {
    return NextResponse.json({ success: false, error: "clanId and a non-empty matches list are required" }, { status: 400 });
  }
  if (!(await isClanAdmin(uid, clanId))) {
    return forbidden("Only a coach, clan admin or academy owner can record results for the whole batch");
  }
  if (matches.length > MAX_RESULTS) {
    return NextResponse.json({ success: false, error: `At most ${MAX_RESULTS} results at a time` }, { status: 400 });
  }

  const entries: MatchEntry[] = [];
  for (const [i, m] of matches.entries()) {
    const entry = parseMatchEntry(m);
    if (typeof entry === "string") {
      return NextResponse.json({ success: false, error: `Match ${i + 1}: ${entry}`, index: i }, { status: 400 });
    }
    entries.push(entry);
  }
  const everyone = entries.flatMap(e => [...e.team1, ...e.team2]);
  if (!(await areClanMembers(clanId, everyone))) {
    return NextResponse.json({ success: false, error: "All players must be members of this batch" }, { status: 400 });
  }

  const connection = await createConnection();
  try {
    await connection.beginTransaction();
    const saved: { submissionId: number; matchId: number; source: MatchSource; points: number; ratingChanges: Record<string, number> }[] = [];
    try {
      for (const entry of entries) {
        const submissionId = await insertSubmission(connection, clanId, entry, uid, { entryMethod: "bulk" });
        const submission = await loadSubmission(connection, submissionId);
        const result = await finalizeSubmission(connection, submission!, uid);
        saved.push({
          submissionId,
          matchId: result.matchId,
          source: entry.matchType === "singles" ? "clan_singles" : "clan_doubles",
          points: result.points,
          ratingChanges: Object.fromEntries(Object.entries(result.ratingChanges).map(([u, d]) => [u, Math.round(d)])),
        });
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    for (const s of saved) {
      const submission = await loadSubmission(connection, s.submissionId);
      if (submission) await notifyResultConfirmed(submission, uid);
    }
    await notifyOvertakes(clanId, saved.map(s => ({ source: s.source, matchId: s.matchId })));

    return NextResponse.json({
      success: true,
      recorded: saved.length,
      results: saved.map(({ submissionId, matchId, points, ratingChanges }) => ({ submissionId, matchId, pointsAwarded: points, ratingChanges })),
    }, { status: 201 });
  } catch (error) {
    console.error("Error recording batch results:", error);
    return NextResponse.json({ success: false, error: "Failed to record results" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
