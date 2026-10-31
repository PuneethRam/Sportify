import { getAuth } from "firebase/auth";

/**
 * Drop-in replacement for fetch() that automatically attaches the current
 * user's Firebase ID token as `Authorization: Bearer <token>`.
 * Throws if there is no authenticated user.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
