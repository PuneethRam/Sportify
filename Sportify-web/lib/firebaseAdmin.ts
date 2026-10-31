import admin from "firebase-admin";
import fs from "fs";
import path from "path";

if (!admin.apps.length) {
  try {
    const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (jsonPath) {
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
