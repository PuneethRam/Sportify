import posthog from "posthog-js";

/**
 * Product analytics. Pages call track(); only this file knows the provider
 * (PostHog), so swapping it is a one-file change. Without
 * NEXT_PUBLIC_POSTHOG_KEY every call is a no-op.
 *
 * Users are identified by Firebase uid only. Never put names, emails or phone
 * numbers in event properties.
 */

export type AnalyticsEvent =
  | "signup_completed" | "clan_created" | "clan_joined" | "batch_joined"
  | "invite_link_created" | "invite_link_opened" | "invite_accepted"
  | "match_submitted" | "match_confirmed" | "match_disputed"
  | "session_created" | "session_joined" | "push_opened";

type Props = Record<string, string | number | boolean | null>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
let started = false;

// Invite tokens are bearer secrets: keep them out of auto-captured URLs
const scrub = (v: unknown) => (typeof v === "string" ? v.replace(/\/i\/[^/?#]+/g, "/i/:token") : v);

export function initAnalytics() {
  if (!KEY || started || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    sanitize_properties: props => {
      for (const k of ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_pathname"]) {
        if (k in props) props[k] = scrub(props[k]);
      }
      return props;
    },
  });
  started = true;
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (started) posthog.capture(event, props);
}

export function identify(uid: string) {
  if (started) posthog.identify(uid);
}

export function resetAnalytics() {
  if (started) posthog.reset();
}
