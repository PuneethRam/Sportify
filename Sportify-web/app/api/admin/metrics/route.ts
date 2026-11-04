import { NextResponse } from "next/server";
import { getUserFromRequest, unauthorized } from "@/lib/auth";
import { forbidden, isPlatformAdmin } from "@/lib/authz";
import { loadMetrics } from "@/lib/metrics";

// GET /api/admin/metrics?weeks=12 — WAC, matches per competitor, new users and
// W1/W4 retention by week. Platform admins only (PLATFORM_ADMIN_UIDS).
export async function GET(req: Request) {
  const uid = await getUserFromRequest(req);
  if (!uid) return unauthorized();
  if (!isPlatformAdmin(uid)) return forbidden();

  const requested = Number(new URL(req.url).searchParams.get("weeks") ?? 12);
  const weeks = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 52) : 12;
  try {
    return NextResponse.json({ success: true, ...(await loadMetrics(weeks)) });
  } catch (error) {
    console.error("Error computing metrics:", error);
    return NextResponse.json({ success: false, error: "Failed to compute metrics" }, { status: 500 });
  }
}
