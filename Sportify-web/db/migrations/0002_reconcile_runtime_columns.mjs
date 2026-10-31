// Columns that used to be added at request time (host_tournament, game-sessions)
// or by the old hand-run migrations/add_singles_doubles_points.sql. Production
// may or may not have them depending on which routes ran, so add only if missing.
// (MySQL 8 has no ADD COLUMN IF NOT EXISTS.)

export async function up(db, { columnExists }) {
  const add = async (table, column, definition) => {
    if (!(await columnExists(table, column))) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  await add("ClanLeaderboard", "singles_points", "FLOAT NOT NULL DEFAULT 0");
  await add("ClanLeaderboard", "doubles_points", "FLOAT NOT NULL DEFAULT 0");

  await add("Tournaments", "is_hosted", "TINYINT(1) NOT NULL DEFAULT 0");
  await add("Tournaments", "max_participants", "INT NOT NULL DEFAULT 0");
  await add("Tournaments", "registration_mode", "VARCHAR(20) NOT NULL DEFAULT 'players'");

  const [rows] = await db.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'tournaments' AND COLUMN_NAME = 'status'`
  );
  const colType = rows[0]?.COLUMN_TYPE ?? "";
  if (colType.startsWith("enum(") && !colType.includes("'open'")) {
    await db.query(`ALTER TABLE Tournaments MODIFY COLUMN status ${colType.slice(0, -1)},'open')`);
  }

  await add("GameSessions", "skill_level", "ENUM('any','beginner','intermediate','advanced') NOT NULL DEFAULT 'any'");
}
