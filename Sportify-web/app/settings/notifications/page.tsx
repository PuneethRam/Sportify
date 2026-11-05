"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/app/components/ProtectedRoute";

// Same categories and wording as the mobile Notifications screen
// (Sportify-app/lib/screens/settings/notification_settings_screen.dart).
const CATEGORIES = [
  { key: "results",       title: "Match results",        detail: "When a result needs your confirmation, is confirmed or disputed" },
  { key: "sessions",      title: "Game sessions",        detail: "When someone joins your game, or a game you joined changes" },
  { key: "announcements", title: "Announcements",        detail: "When your coach or academy posts" },
  { key: "invites",       title: "Invites accepted",     detail: "When someone joins using your invite link" },
  { key: "streaks",       title: "Streak reminders",     detail: "Saturday nudge when your weekly streak is at risk" },
  { key: "seasons",       title: "Seasons and rankings", detail: "Season results, badges and when someone passes you" },
] as const;

type Prefs = Record<string, boolean>;

function NotificationSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth("/api/notifications/preferences")
      .then(r => r.json())
      .then(d => d.success ? setPrefs(d.preferences) : setError(d.error ?? "Couldn't load your settings"))
      .catch(() => setError("Couldn't load your settings"));
  }, [user]);

  const toggle = async (key: string) => {
    if (!prefs || saving) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setPrefs(d.preferences);
    } catch {
      setPrefs(p => p && { ...p, [key]: !next });
      setError("Couldn't save that change. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back"
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="min-w-0">
          <h1 className="display-font font-bold text-2xl tracking-wide text-slate-800 dark:text-white">Notifications</h1>
          <p className="text-xs text-slate-400">Choose what Sportify notifies you about on your phone. Changes apply to all your devices.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-400/5 border border-rose-400/20 text-rose-500 text-sm">{error}</div>
      )}

      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-500" />
        {!prefs ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {CATEGORIES.map(c => {
              const on = prefs[c.key] !== false;
              return (
                <li key={c.key}>
                  <label className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{c.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.detail}</p>
                    </div>
                    <input type="checkbox" role="switch" checked={on} onChange={() => toggle(c.key)}
                      disabled={saving === c.key} aria-label={c.title} className="sr-only peer" />
                    <span aria-hidden
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 ${
                        on ? "bg-blue-600" : "bg-slate-300 dark:bg-white/15"
                      } ${saving === c.key ? "opacity-60" : ""}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-400 px-1">
        <Bell className="w-3.5 h-3.5 flex-shrink-0" />
        If you get nothing at all, check that notifications are allowed for Sportify in your phone&apos;s settings.
      </p>
    </div>
  );
}

export default function NotificationSettingsPage() {
  return (
    <ProtectedRoute>
      <NotificationSettings />
    </ProtectedRoute>
  );
}
