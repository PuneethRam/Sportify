import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { uid, name, email } = await req.json();

    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: Number(process.env.MYSQL_PORT),
      ssl: {
        ca: fs.readFileSync(path.join(process.cwd(), process.env.MYSQL_SSL_CERT || "")),
      },
    });

    await connection.execute(
      "INSERT INTO Users (user_id, name, email) VALUES (?, ?, ?)",
      [uid, name, email]
    );

    await connection.end();

    return NextResponse.json({ message: "User added to MySQL" }, { status: 200 });
  } catch (error) {
    console.error("❌ MySQL Insert Error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
