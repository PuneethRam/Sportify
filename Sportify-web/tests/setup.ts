import { vi } from "vitest";

// Tests authenticate with "Bearer uid:<user id>" instead of real Firebase ID tokens.
vi.mock("@/lib/firebaseAdmin", () => ({ default: {} }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (!token.startsWith("uid:")) throw new Error("invalid token");
      return { uid: token.slice(4) };
    },
  }),
}));
