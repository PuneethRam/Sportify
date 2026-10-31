import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

async function ensureSchema() {
  await executeQuery(`CREATE TABLE IF NOT EXISTS HostedTournamentTeams (
    hosted_team_id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id  INT NOT NULL,
    team_name      VARCHAR(255) NOT NULL,
    created_by_user_id   VARCHAR(255) NOT NULL,
    created_by_user_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_team_name (tournament_id, team_name)
  )`);

  await executeQuery(`CREATE TABLE IF NOT EXISTS HostedTournamentRegistrations (
    registration_id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT NOT NULL,
    user_id         VARCHAR(255) NOT NULL,
    user_name       VARCHAR(255) NOT NULL,
    hosted_team_id  INT NULL,
    registered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_tournament (tournament_id, user_id)
  )`);

  // Add is_hosted / max_participants / registration_mode columns if missing
  const colCheck = await executeQuery(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'is_hosted'`
  ) as RowDataPacket[];

  if ((colCheck[0]?.cnt ?? 0) === 0) {
    await executeQuery(`ALTER TABLE Tournaments ADD COLUMN is_hosted TINYINT(1) NOT NULL DEFAULT 0`);
    await executeQuery(`ALTER TABLE Tournaments ADD COLUMN max_participants INT NOT NULL DEFAULT 0`);
    await executeQuery(`ALTER TABLE Tournaments ADD COLUMN registration_mode VARCHAR(20) NOT NULL DEFAULT 'players'`);
  }

  // Add 'open' to the status ENUM if it isn't already there
  const statusInfo = await executeQuery(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tournaments' AND COLUMN_NAME = 'status'`
  ) as RowDataPacket[];

  const colType = (statusInfo[0]?.COLUMN_TYPE as string) ?? '';
  if (colType && !colType.includes("'open'")) {
    // colType looks like: enum('upcoming','ongoing','completed')
    // append 'open' before the closing paren
    const newColType = colType.slice(0, -1) + ",'open')";
    await executeQuery(`ALTER TABLE Tournaments MODIFY COLUMN status ${newColType}`);
  }
}

export async function POST(req: Request) {
  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    await ensureSchema();

    const { clanId, tournament_name, tournament_type, format, registration_mode, max_participants, teams_per_group } =
      await req.json();

    if (!clanId || !tournament_name || !tournament_type || !format) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const result = await executeQuery(
      `INSERT INTO Tournaments
        (clan_id, tournament_name, tournament_type, format, status, start_date, teams_per_group, is_hosted, max_participants, registration_mode)
       VALUES (?, ?, ?, ?, 'open', NOW(), ?, 1, ?, ?)`,
      [clanId, tournament_name, tournament_type, format, teams_per_group ?? 4, max_participants || 0, registration_mode || "players"]
    ) as ResultSetHeader;

    return NextResponse.json({ success: true, tournament_id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error("Error hosting tournament:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to host tournament" },
      { status: 500 }
    );
  }
}
