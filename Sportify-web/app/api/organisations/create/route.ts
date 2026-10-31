import { NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2/promise";
import { createConnection } from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  const connection = await createConnection();

  try {
    const { name } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Organisation name is required" }, { status: 400 });
    }

    await connection.beginTransaction();

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO Organisations (name, owner_user_id) VALUES (?, ?)",
        [name, uid]
      );

      await connection.commit();

      return NextResponse.json({ message: "Organisation created successfully", orgId: result.insertId }, { status: 201 });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
