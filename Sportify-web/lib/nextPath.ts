import { useEffect, useState } from "react";

/**
 * `next` if it is a path on `origin`, else null. Resolving with the URL
 * parser (instead of checking the string) is what makes this safe: browsers
 * treat "\" like "/", so "/\evil.com" would otherwise become "//evil.com".
 */
export function safeNextPath(next: string | null | undefined, origin: string): string | null {
  if (!next || !next.startsWith("/")) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** The ?next= path to return to after sign-in, if it's a safe same-site path. */
export function nextPath(fallback = "/dashboard") {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return safeNextPath(next, window.location.origin) ?? fallback;
}

/** Appends the current ?next= to an auth page link, e.g. login ↔ signup. */
export function withNext(href: string) {
  const next = nextPath("");
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}

/**
 * withNext() for a link rendered on the page. The server has no ?next= to
 * see, and React keeps the server's href after hydration, so add it after
 * mount instead of during render.
 */
export function useWithNext(href: string) {
  const [link, setLink] = useState(href);
  useEffect(() => setLink(withNext(href)), [href]);
  return link;
}
