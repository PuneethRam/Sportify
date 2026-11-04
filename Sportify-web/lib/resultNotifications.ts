import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { displayName, notify } from "@/lib/notify";
import { isOpponentOfSubmitter, Submission, submitterSide, teamsOf } from "@/lib/matchSubmissions";

const clanName = async (clanId: number) => {
  const [c] = await executeQuery(`SELECT name FROM Clans WHERE clan_id = ?`, [clanId]) as RowDataPacket[];
  return (c?.name as string | undefined) ?? "your clan";
};

/** A player submitted a result: the other side has to confirm it. */
export async function notifyResultSubmitted(s: Submission) {
  const { team1, team2 } = teamsOf(s);
  const opponents = [...team1, ...team2].filter(p => p !== s.submitted_by && isOpponentOfSubmitter(s, p));
  await notify(opponents, "result_needs_confirmation", {
    title: "Confirm your match result",
    body: `${await displayName(s.submitted_by)} recorded a ${s.match_type} result in ${await clanName(s.clan_id)}. Tap to confirm or dispute.`,
    route: `/clans/${s.clan_id}`,
  });
}

/** A result was confirmed (by the opponent, or entered by an admin): tell everyone else who played. */
export async function notifyResultConfirmed(s: Submission, resolverUid: string) {
  const { team1, team2 } = teamsOf(s);
  await notify([...team1, ...team2].filter(p => p !== resolverUid), "result_confirmed", {
    title: "Result confirmed",
    body: `Your ${s.match_type} result in ${await clanName(s.clan_id)} is confirmed and on the leaderboard.`,
    route: `/clans/${s.clan_id}`,
  });
}

/** A result was disputed: tell the submitter's side. */
export async function notifyResultDisputed(s: Submission, resolverUid: string) {
  const side = submitterSide(s);
  const team = side ? teamsOf(s)[side] : [s.submitted_by];
  await notify([s.submitted_by, ...team].filter(p => p !== resolverUid), "result_disputed", {
    title: "Result disputed",
    body: `${await displayName(resolverUid)} disputed your ${s.match_type} result in ${await clanName(s.clan_id)}. A clan admin will decide.`,
    route: `/clans/${s.clan_id}`,
  });
}
