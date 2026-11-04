import { NextResponse } from "next/server";

// Served at /.well-known/assetlinks.json (rewrite in next.config.ts) so
// Android opens /i/<token> links straight in the app (App Links).
// ANDROID_SHA256_CERT_FINGERPRINTS: comma-separated SHA-256 fingerprints of
// the release signing key(s) — with Play App Signing, the one shown in Play
// Console → App integrity. Without it Android just opens the web page.
export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!fingerprints.length) return NextResponse.json([]);
  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: process.env.ANDROID_PACKAGE_NAME || "com.avartanlabs.sportify_app",
      sha256_cert_fingerprints: fingerprints,
    },
  }]);
}
