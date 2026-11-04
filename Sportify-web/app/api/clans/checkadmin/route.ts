// app/api/clans/checkadmin/route.ts

import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { isClanAdmin } from "@/lib/authz";

export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const clanId = searchParams.get("clanId");

    if (!clanId) {
      return NextResponse.json({
        success: false,
        error: "Clan ID is required"
      }, { status: 400 });
    }

    // Admin / Coach / Owner of the clan, or the owner of the batch's academy
    const isAdmin = await isClanAdmin(uid, clanId);

    return NextResponse.json({ 
      success: true,
      isAdmin 
    }, { status: 200 });
    
  } catch (error) {
    console.error("❌ MySQL Fetch Error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}