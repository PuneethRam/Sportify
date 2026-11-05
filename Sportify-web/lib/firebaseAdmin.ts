import admin from "firebase-admin";
import fs from "fs";
import path from "path";

/**
 * Whether to trust Firebase Auth emulator tokens: local end-to-end runs only,
 * which must opt in with SPORTIFY_E2E=1, and never on Netlify. firebase-admin
 * skips token signature checks whenever FIREBASE_AUTH_EMULATOR_HOST is set, so
 * a stray value anywhere else is removed before any token is verified.
 */
export function emulatorAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.FIREBASE_AUTH_EMULATOR_HOST && env.SPORTIFY_E2E === "1" && !env.NETLIFY;
}

const useEmulator = emulatorAllowed();
if (process.env.FIREBASE_AUTH_EMULATOR_HOST && !useEmulator) {
  console.error("[Firebase Admin] Ignoring FIREBASE_AUTH_EMULATOR_HOST: emulator tokens are only trusted with SPORTIFY_E2E=1, off Netlify.");
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

if (!admin.apps.length) {
  try {
    const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (useEmulator) {
      // Local end-to-end runs only: verify tokens from the Firebase Auth emulator
      admin.initializeApp({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    } else if (jsonPath) {
      const resolved = path.isAbsolute(jsonPath)
        ? jsonPath
        : path.join(process.cwd(), jsonPath);
      const serviceAccount = JSON.parse(fs.readFileSync(resolved, "utf-8"));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

      if (!projectId || !clientEmail || !privateKey) {
        console.error(
          "[Firebase Admin] Not configured — set FIREBASE_ADMIN_PROJECT_ID, " +
          "FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in Netlify env vars. " +
          "All authenticated API routes will return 401 until this is fixed."
        );
      } else {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      }
    }
  } catch (e) {
    console.error("[Firebase Admin] Initialization error:", e);
  }
}

export default admin;
