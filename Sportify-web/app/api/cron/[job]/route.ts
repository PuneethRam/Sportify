import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { closePendingSeasons } from "@/lib/seasons";
import { sendStreakNudges } from "@/lib/streaks";

// POST /api/cron/<job>   Authorization: Bearer <CRON_SECRET>
// Scheduled jobs, called by .github/workflows/cron.yml:
//   close-seasons  daily just after midnight India time: closes last month's
//                  seasons (badges + season_ended push). Safe to run often.
//   streak-nudges  Saturday evening India time: streak_at_risk pushes, once
//                  per user per week.
const JOBS: Record<string, () => Promise<unknown>> = {
  "close-seasons": () => closePendingSeasons(new Date()).then(closed => ({ closed })),
  "streak-nudges": () => sendStreakNudges(new Date()),
};

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: `Unknown job. One of: ${Object.keys(JOBS).join(", ")}` }, { status: 404 });
  try {
    return NextResponse.json({ success: true, job, result: await run() });
  } catch (error) {
    console.error(`[cron] ${job} failed:`, error);
    return NextResponse.json({ success: false, job, error: "Job failed" }, { status: 500 });
  }
}
