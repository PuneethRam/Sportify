import { RowDataPacket } from "mysql2";
import admin from "@/lib/firebaseAdmin";
import { getMessaging } from "firebase-admin/messaging";
import { executeQuery } from "@/lib/db";

/**
 * Push notifications. Everything goes through notify(), which is where user
 * preferences, the daily cap and dead-token cleanup live:
 *
 *   await notify(uids, "result_confirmed", { title, body, route });
 *
 * notify() never throws: a failed push must not fail the request that
 * triggered it. Call it after the triggering transaction has committed.
 *
 * `route` is the mobile app path to open when the notification is tapped
 * (go_router paths: /clans/<id>, /clans/<id>/tournament/<tournamentId>,
 * /find/<id>, /academy/<orgId>).
 */

export const CATEGORIES = ["results", "sessions", "announcements", "invites", "streaks", "seasons"] as const;
export type Category = (typeof CATEGORIES)[number];

// Transactional = something the user has to act on or would be hurt to miss.
// The rest count towards the daily cap.
export const NOTIFICATION_TYPES = {
  result_needs_confirmation: { category: "results", transactional: true },
  result_confirmed:          { category: "results", transactional: true },
  result_disputed:           { category: "results", transactional: true },
  session_updated:           { category: "sessions", transactional: true },
  session_cancelled:         { category: "sessions", transactional: true },
  session_player_joined:     { category: "sessions", transactional: false },
  announcement:              { category: "announcements", transactional: false },
  invite_accepted:           { category: "invites", transactional: false },
  streak_at_risk:            { category: "streaks", transactional: false },
  season_ended:              { category: "seasons", transactional: false },
  rank_overtaken:            { category: "seasons", transactional: false },
} as const satisfies Record<string, { category: Category; transactional: boolean }>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/** Non-transactional pushes per user per rolling 24 hours. */
export const DAILY_CAP = 5;

export interface PushPayload {
  title: string;
  body: string;
  route: string;
}

export interface PushMessage extends PushPayload { type: NotificationType }

/** Sends one message to many tokens; reports which tokens FCM says are dead. */
export type PushSender = (tokens: string[], message: PushMessage) => Promise<{ delivered: string[]; invalid: string[] }>;

const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const fcmSender: PushSender = async (tokens, message) => {
  if (!admin.apps?.length) return { delivered: [], invalid: [] }; // Firebase Admin not configured
  const delivered: string[] = [];
  const invalid: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      notification: { title: message.title, body: message.body },
      data: { type: message.type, route: message.route },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });
    res.responses.forEach((r, j) => {
      if (r.success) delivered.push(chunk[j]);
      else if (r.error && DEAD_TOKEN_ERRORS.has(r.error.code)) invalid.push(chunk[j]);
    });
  }
  return { delivered, invalid };
};

let sender: PushSender = fcmSender;

/** Tests swap in a recording sender. Pass null to restore FCM. */
export function setPushSender(s: PushSender | null) {
  sender = s ?? fcmSender;
}

const placeholders = (n: number) => Array(n).fill("?").join(",");

export async function notify(to: string | (string | null | undefined)[], type: NotificationType, payload: PushPayload) {
  const uids = [...new Set((Array.isArray(to) ? to : [to]).filter((u): u is string => !!u))];
  if (!uids.length) return;
  const { category, transactional } = NOTIFICATION_TYPES[type];
  const outcome = new Map<string, string>();

  try {
    const optedOut = await executeQuery(
      `SELECT user_id FROM NotificationPreferences
       WHERE category = ? AND enabled = 0 AND user_id IN (${placeholders(uids.length)})`,
      [category, ...uids]
    ) as RowDataPacket[];
    optedOut.forEach(r => outcome.set(r.user_id, "opted_out"));

    if (!transactional) {
      const capped = await executeQuery(
        `SELECT user_id FROM NotificationLog
         WHERE transactional = 0 AND outcome = 'sent' AND created_at >= NOW() - INTERVAL 1 DAY
           AND user_id IN (${placeholders(uids.length)})
         GROUP BY user_id HAVING COUNT(*) >= ?`,
        [...uids, DAILY_CAP]
      ) as RowDataPacket[];
      capped.forEach(r => outcome.has(r.user_id) || outcome.set(r.user_id, "capped"));
    }

    const eligible = uids.filter(u => !outcome.has(u));
    const tokens = eligible.length
      ? await executeQuery(
          `SELECT token, user_id FROM DeviceTokens WHERE user_id IN (${placeholders(eligible.length)})`,
          eligible
        ) as RowDataPacket[]
      : [];
    const owner = new Map(tokens.map(t => [t.token as string, t.user_id as string]));
    eligible.forEach(u => outcome.set(u, "no_device"));

    if (tokens.length) {
      let result: Awaited<ReturnType<PushSender>> = { delivered: [], invalid: [] };
      try {
        result = await sender([...owner.keys()], { ...payload, type });
      } catch (err) {
        console.error("[notify] send failed:", err);
      }
      const users = new Set(owner.values());
      users.forEach(u => outcome.set(u, "failed"));
      result.delivered.forEach(t => owner.has(t) && outcome.set(owner.get(t)!, "sent"));
      if (result.invalid.length) {
        await executeQuery(
          `DELETE FROM DeviceTokens WHERE token IN (${placeholders(result.invalid.length)})`,
          result.invalid
        );
      }
    }
  } catch (err) {
    console.error("[notify] error:", err);
  }

  try {
    const rows = [...outcome.entries()];
    if (rows.length) {
      await executeQuery(
        `INSERT INTO NotificationLog (user_id, type, transactional, outcome) VALUES ${rows.map(() => "(?, ?, ?, ?)").join(",")}`,
        rows.flatMap(([u, o]) => [u, type, transactional ? 1 : 0, o])
      );
    }
  } catch (err) {
    console.error("[notify] log failed:", err);
  }
}

/** Display name for push text (never sent to analytics). */
export async function displayName(uid: string, fallback = "Someone") {
  const [row] = await executeQuery(`SELECT name FROM Users WHERE user_id = ?`, [uid]) as RowDataPacket[];
  return (row?.name as string | undefined)?.trim() || fallback;
}

/**
 * Claims one-off keys (e.g. "rank_overtaken:<uid>:<clan>:<day>") and returns
 * the ones nobody claimed before. Use to send a push at most once per key.
 */
export async function claimOnce(keys: string[]): Promise<Set<string>> {
  const won = new Set<string>();
  for (const key of new Set(keys)) {
    try {
      const res = await executeQuery(`INSERT IGNORE INTO NotificationDedupe (dedupe_key) VALUES (?)`, [key]) as { affectedRows: number };
      if (res.affectedRows === 1) won.add(key);
    } catch (err) {
      console.error("[notify] dedupe failed:", err);
    }
  }
  return won;
}
