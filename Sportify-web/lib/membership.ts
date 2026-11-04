import { RowDataPacket } from "mysql2";
import { createConnection, executeQuery } from "@/lib/db";
import { STARTING_POINTS } from "@/lib/scoring";

/**
 * Joining a clan, an academy batch or a game session. The join routes and
 * invite-link acceptance (api/invites/[token]/accept) both go through these,
 * so a link can never let someone in that the normal route wouldn't.
 */

export class JoinError extends Error {
  constructor(message: string, public status: number, public alreadyMember = false) {
    super(message);
  }
}

async function addMember(clanId: number, uid: string) {
  const connection = await createConnection();
  try {
    await connection.beginTransaction();
    try {
      await connection.execute(
        "INSERT INTO ClanMembers (user_id, clan_id, role) VALUES (?, ?, 'Member')",
        [uid, clanId]
      );
      await connection.execute(
        `INSERT INTO ClanLeaderboard (clan_id, user_id, clan_points, matchesplayed, matcheswon, matcheslost)
         VALUES (?, ?, ?, 0, 0, 0)`,
        [clanId, uid, STARTING_POINTS]
      );
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } finally {
    await connection.end();
  }
}

async function isMember(clanId: number, uid: string) {
  const rows = await executeQuery(
    "SELECT 1 FROM ClanMembers WHERE clan_id = ? AND user_id = ?",
    [clanId, uid]
  ) as RowDataPacket[];
  return rows.length > 0;
}

/** Joins a social clan. Academy batches can only be joined with their invite code. */
export async function joinClan(uid: string, clanId: number) {
  const [clan] = await executeQuery("SELECT type FROM Clans WHERE clan_id = ?", [clanId]) as RowDataPacket[];
  if (!clan) throw new JoinError("Clan not found", 404);
  if (clan.type === "batch") {
    throw new JoinError("This is an academy batch — join it with an invite code", 403);
  }
  if (await isMember(clanId, uid)) throw new JoinError("User is already in the clan", 400, true);
  await addMember(clanId, uid);
  return { clanId };
}

/** Joins the academy batch whose current invite code is `inviteCode`. */
export async function joinBatchByCode(uid: string, inviteCode: string) {
  const [batch] = await executeQuery(
    "SELECT clan_id, name, org_id FROM Clans WHERE invite_code = ? AND type = 'batch'",
    [inviteCode.toUpperCase().trim()]
  ) as RowDataPacket[];
  if (!batch) throw new JoinError("Invalid invite code", 404);
  if (await isMember(batch.clan_id, uid)) {
    throw new JoinError("You are already in this batch", 400, true);
  }
  await addMember(batch.clan_id, uid);
  return { batchId: batch.clan_id as number, batchName: batch.name as string, orgId: batch.org_id as number | null };
}

/** Joins an open game session. Returns whether the user was newly added. */
export async function joinGameSession(uid: string, sessionId: number, userName: string | null) {
  const [session] = await executeQuery(
    `SELECT gs.session_id, gs.max_players, gs.status, COUNT(gsp.id) AS joined_count,
            SUM(gsp.user_id = ?) AS is_player
     FROM GameSessions gs
     LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
     WHERE gs.session_id = ?
     GROUP BY gs.session_id`,
    [uid, sessionId]
  ) as RowDataPacket[];

  if (!session) throw new JoinError("Session not found", 404);
  if (Number(session.is_player) > 0) throw new JoinError("You have already joined this session", 400, true);
  if (session.status === "cancelled") throw new JoinError("Session cancelled", 400);
  if (session.status === "completed") throw new JoinError("Session already completed", 400);
  if (Number(session.joined_count) >= session.max_players) throw new JoinError("Session is full", 400);

  await executeQuery(
    `INSERT IGNORE INTO GameSessionPlayers (session_id, user_id, user_name) VALUES (?, ?, ?)`,
    [sessionId, uid, userName]
  );

  // Update status to 'full' if now at capacity
  const [updated] = await executeQuery(
    `SELECT COUNT(*) AS cnt FROM GameSessionPlayers WHERE session_id = ?`,
    [sessionId]
  ) as RowDataPacket[];
  if (Number(updated.cnt) >= session.max_players) {
    await executeQuery(`UPDATE GameSessions SET status = 'full' WHERE session_id = ?`, [sessionId]);
  }
  return { sessionId };
}
