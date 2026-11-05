import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { displayName, notify } from "@/lib/notify";
import { isOpponentOfSubmitter, Submission, submitterSide, teamsOf } from "@/lib/matchSubmissions";

/** Where a result was played (clan or tournament name) and the app route to open. */
const placeOf = async (s: Submission) => {
  if (s.tournament_match_id) {
    const [t] = await executeQuery(
      `SELECT t.tournament_id, t.tournament_name FROM TournamentMatches tm
       JOIN Tournaments t ON t.tournament_id = tm.tournament_id WHERE tm.match_id = ?`,
      [s.tournament_match_id]
    ) as RowDataPacket[];
    if (t) return { name: t.tournament_name as string, route: `/clans/${s.clan_id}/tournament/${t.tournament_id}` };
  }
  const [c] = await executeQuery(`SELECT name FROM Clans WHERE clan_id = ?`, [s.clan_id]) as RowDataPacket[];
  return { name: (c?.name as string | undefined) ?? "your clan", route: `/clans/${s.clan_id}` };
};

/** A player submitted a result: the other side has to confirm it. */
export async function notifyResultSubmitted(s: Submission) {
  const { team1, team2 } = teamsOf(s);
  const opponents = [...team1, ...team2].filter(p => p !== s.submitted_by && isOpponentOfSubmitter(s, p));
  const place = await placeOf(s);
  await notify(opponents, "result_needs_confirmation", {
    title: "Confirm your match result",
    body: `${await displayName(s.submitted_by)} recorded a ${s.match_type} result in ${place.name}. Tap to confirm or dispute.`,
    route: place.route,
  });
}

/** A result was confirmed (by the opponent, or entered by an admin): tell everyone else who played. */
export async function notifyResultConfirmed(s: Submission, resolverUid: string) {
  const { team1, team2 } = teamsOf(s);
  const place = await placeOf(s);
  await notify([...team1, ...team2].filter(p => p !== resolverUid), "result_confirmed", {
    title: "Result confirmed",
    body: `Your ${s.match_type} result in ${place.name} is confirmed and on the leaderboard.`,
    route: place.route,
  });
}

/** A result was disputed: tell the submitter's side. */
export async function notifyResultDisputed(s: Submission, resolverUid: string) {
  const side = submitterSide(s);
  const team = side ? teamsOf(s)[side] : [s.submitted_by];
  const place = await placeOf(s);
  await notify([s.submitted_by, ...team].filter(p => p !== resolverUid), "result_disputed", {
    title: "Result disputed",
    body: `${await displayName(resolverUid)} disputed your ${s.match_type} result in ${place.name}. ${s.tournament_match_id ? "A host or clan admin who didn't play" : "A clan admin"} will decide.`,
    route: place.route,
  });
}
