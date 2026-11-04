/** The ?next= path to return to after sign-in, if it's a safe same-site path. */
export function nextPath(fallback = "/dashboard") {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Appends the current ?next= to an auth page link, e.g. login ↔ signup. */
export function withNext(href: string) {
  const next = nextPath("");
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}
