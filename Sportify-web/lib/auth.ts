import "@/lib/firebaseAdmin"; // ensure admin is initialised
import { getAuth } from "firebase-admin/auth";
import { NextResponse } from "next/server";

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Returns the verified uid, or null if the token is missing or invalid.
 */
export async function getUserFromRequest(req: Request): Promise<string | null> {
  try {
    const header = req.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Returns a 401 NextResponse. Use as: return unauthorized(); */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
