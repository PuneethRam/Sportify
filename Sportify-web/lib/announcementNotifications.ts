import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { notify } from "@/lib/notify";

/** A coach posted to a batch, or staff posted to the whole academy. */
export async function notifyAnnouncement(scope: "batch" | "org", id: number, authorUid: string, title: string) {
  const rows = scope === "batch"
    ? await executeQuery(
        `SELECT cm.user_id, c.name FROM ClanMembers cm JOIN Clans c ON c.clan_id = cm.clan_id WHERE cm.clan_id = ?`,
        [id]
      ) as RowDataPacket[]
    : await executeQuery(
        `SELECT cm.user_id, o.name FROM ClanMembers cm
         JOIN Clans c ON c.clan_id = cm.clan_id JOIN Organisations o ON o.org_id = c.org_id
         WHERE c.org_id = ?
         UNION SELECT owner_user_id, name FROM Organisations WHERE org_id = ?`,
        [id, id]
      ) as RowDataPacket[];
  if (!rows.length) return;
  await notify(rows.map(r => r.user_id).filter(u => u !== authorUid), "announcement", {
    title: `New announcement in ${rows[0].name}`,
    body: title,
    route: scope === "batch" ? `/clans/${id}` : `/academy/${id}`,
  });
}
