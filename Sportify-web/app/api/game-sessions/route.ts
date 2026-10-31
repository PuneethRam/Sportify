import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

const ENSURE_TABLES = `
  CREATE TABLE IF NOT EXISTS GameSessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    host_user_id VARCHAR(255) NOT NULL,
    host_name VARCHAR(255),
    title VARCHAR(200) NOT NULL,
    sport VARCHAR(100),
    location TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    max_players INT NOT NULL DEFAULT 4,
    description TEXT,
    status ENUM('open','full','completed','cancelled') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;
const ENSURE_PLAYERS = `
  CREATE TABLE IF NOT EXISTS GameSessionPlayers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_player (session_id, user_id)
  )
`;
const ENSURE_MESSAGES = `
  CREATE TABLE IF NOT EXISTS GameSessionMessages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

async function ensureTables() {
  await executeQuery(ENSURE_TABLES);
  await executeQuery(ENSURE_PLAYERS);
  await executeQuery(ENSURE_MESSAGES);
  // Self-migrating: add skill_level if the table already existed without it
  try {
    await executeQuery(
      `ALTER TABLE GameSessions ADD COLUMN skill_level ENUM('any','beginner','intermediate','advanced') NOT NULL DEFAULT 'any'`
    );
  } catch { /* column already exists — ignore */ }
}

// GET /api/game-sessions — list upcoming/open sessions with player count
export async function GET() {
  try {
    await ensureTables();
    const rows = await executeQuery(
      `SELECT
         gs.*,
         COUNT(gsp.id) AS joined_count
       FROM GameSessions gs
       LEFT JOIN GameSessionPlayers gsp ON gsp.session_id = gs.session_id
       WHERE gs.status IN ('open', 'full') AND gs.scheduled_at >= NOW() - INTERVAL 2 HOUR
       GROUP BY gs.session_id
       ORDER BY gs.scheduled_at ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/game-sessions — create a session (host is auto-added as first player)
export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    await ensureTables();
    const { hostName, title, sport, location, scheduledAt, maxPlayers, description, skillLevel } = await req.json();
    if (!title || !location || !scheduledAt || !maxPlayers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const validSkill = ["any","beginner","intermediate","advanced"];
    const skill = validSkill.includes(skillLevel) ? skillLevel : "any";
    const result = await executeQuery(
      `INSERT INTO GameSessions (host_user_id, host_name, title, sport, location, scheduled_at, max_players, description, skill_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, hostName || null, title, sport || null, location, scheduledAt, maxPlayers, description || null, skill]
    ) as { insertId: number };
    const sessionId = result.insertId;
    // Host auto-joins as first player
    await executeQuery(
      `INSERT INTO GameSessionPlayers (session_id, user_id, user_name) VALUES (?, ?, ?)`,
      [sessionId, uid, hostName || null]
    );
    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
