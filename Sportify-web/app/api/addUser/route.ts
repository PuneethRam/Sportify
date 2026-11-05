import { NextResponse } from "next/server";
import { createConnection } from '@/lib/db'; // Import the connection function
import { getUserFromRequest, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  let connection;

  try {
    const uid = await getUserFromRequest(req);
    if (!uid) return unauthorized();

    const { name, email } = await req.json();

    // Create database connection
    connection = await createConnection();

    await connection.execute(
      // Idempotent: Google sign-in calls this every time; keep the existing profile
      "INSERT INTO Users (user_id, name, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [uid, name, email]
    );

    return NextResponse.json({ message: "User added to MySQL" }, { status: 200 });
    
  } catch (error) {
    console.error("❌ MySQL Insert Error:", error);

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Unknown error",
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  } finally {
    // Always close the connection
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error("Error closing connection:", closeError);
      }
    }
  }
}