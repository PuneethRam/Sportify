import { NextResponse } from "next/server";

// Served at /.well-known/apple-app-site-association (rewrite in
// next.config.ts) for iOS Universal Links. Needs APPLE_TEAM_ID; until it is
// set this is a 404 and iOS opens /i/<token> links in the browser.
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const bundleId = process.env.IOS_BUNDLE_ID || "com.avartanlabs.sportifyApp";
  return NextResponse.json({
    applinks: {
      details: [{ appIDs: [`${teamId}.${bundleId}`], components: [{ "/": "/i/*" }] }],
    },
  });
}
