import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { CATEGORIES, Category } from "@/lib/notify";

async function load(uid: string) {
  const rows = await executeQuery(
    `SELECT category, enabled FROM NotificationPreferences WHERE user_id = ?`,
    [uid]
  ) as RowDataPacket[];
  const off = new Set(rows.filter(r => !r.enabled).map(r => r.category));
  return Object.fromEntries(CATEGORIES.map(c => [c, !off.has(c)])) as Record<Category, boolean>;
}

// GET /api/notifications/preferences → { preferences: { results: true, sessions: true, ... } }
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  return NextResponse.json({ success: true, preferences: await load(uid) });
}

// PUT /api/notifications/preferences  { results?, sessions?, announcements?, invites?, streaks?, seasons?: bool }
export async function PUT(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const body = await req.json().catch(() => null);
  const updates = Object.entries(body ?? {}).filter(([c, v]) => CATEGORIES.includes(c as Category) && typeof v === "boolean");
  if (!updates.length) {
    return NextResponse.json({ success: false, error: `Send one or more of ${CATEGORIES.join(", ")} as true/false` }, { status: 400 });
  }
  for (const [category, enabled] of updates) {
    await executeQuery(
      `INSERT INTO NotificationPreferences (user_id, category, enabled) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [uid, category, enabled ? 1 : 0]
    );
  }
  return NextResponse.json({ success: true, preferences: await load(uid) });
}
