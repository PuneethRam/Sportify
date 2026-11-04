import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { displayName, notify } from "@/lib/notify";

/** Tells the host someone joined their game session. */
export async function notifySessionJoined(sessionId: number, joinedUid: string) {
  const [s] = await executeQuery(
    `SELECT host_user_id, title FROM GameSessions WHERE session_id = ?`,
    [sessionId]
  ) as RowDataPacket[];
  if (!s || s.host_user_id === joinedUid) return;
  await notify(s.host_user_id, "session_player_joined", {
    title: "New player joined",
    body: `${await displayName(joinedUid)} joined "${s.title}"`,
    route: `/find/${sessionId}`,
  });
}

/** Tells everyone else in a session that it changed or was cancelled. */
export async function notifySessionChanged(sessionId: number, byUid: string, status: string) {
  const [s] = await executeQuery(`SELECT title FROM GameSessions WHERE session_id = ?`, [sessionId]) as RowDataPacket[];
  if (!s) return;
  const players = await executeQuery(
    `SELECT user_id FROM GameSessionPlayers WHERE session_id = ? AND user_id <> ?`,
    [sessionId, byUid]
  ) as RowDataPacket[];
  const cancelled = status === "cancelled";
  await notify(players.map(p => p.user_id), cancelled ? "session_cancelled" : "session_updated", {
    title: cancelled ? "Session cancelled" : "Session updated",
    body: cancelled ? `"${s.title}" has been cancelled` : `"${s.title}" is now ${status}`,
    route: `/find/${sessionId}`,
  });
}
