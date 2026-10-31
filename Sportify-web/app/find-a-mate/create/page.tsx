"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { ArrowLeft, MapPin, Flame, Loader2, Users } from "lucide-react";

const SPORTS = ["Badminton", "Tennis", "Pickleball", "Football", "Cricket", "Basketball", "Table Tennis", "Other"];

function localDatetimeStr(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HostGamePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ uid: string; displayName?: string | null; email?: string | null } | null>(null);

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [skillLevel, setSkillLevel] = useState<"any"|"beginner"|"intermediate"|"advanced">("any");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return localDatetimeStr(d);
  });
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(u =>
      setUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null)
    );
    return () => unsub();
  }, []);

  const hostName = user?.displayName || user?.email?.split("@")[0] || "Host";
  const canSubmit = title.trim() && location.trim() && date && !!user;

  const submit = async () => {
    if (!canSubmit) { setError("Fill in all required fields"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth("/api/game-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostName,
          title: title.trim(),
          sport: sport || null,
          location: location.trim(),
          // Keep as local time — no UTC conversion; MySQL stores and compares in server local time
          scheduledAt: date.replace("T", " ") + ":00",
          maxPlayers,
          description: description.trim() || null,
          skillLevel,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "Failed to create");
      router.push(`/find-a-mate/${d.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-up pb-12">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white leading-none">Host a Game</h1>
          <p className="text-xs text-slate-400 mt-1">Post your game so others can find and join</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Step 1 — Game details */}
      <div className="sport-card p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">1</span>
          </div>
          <h2 className="section-heading">Game Details</h2>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Title <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Badminton doubles this evening"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>

        {/* Sport */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sport</label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(prev => prev === s ? "" : s)}
                className={`px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  sport === s
                    ? "bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white"
                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Skill level */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Skill Level</label>
          <div className="grid grid-cols-4 gap-2">
            {([
              { value: "any",          label: "Any",          sub: "All welcome",    bg: "bg-slate-100 dark:bg-white/8",             active: "bg-slate-600 dark:bg-slate-500",    text: "text-slate-600 dark:text-slate-300" },
              { value: "beginner",     label: "Beginner",     sub: "Just starting",  bg: "bg-emerald-50 dark:bg-emerald-500/10",     active: "bg-emerald-600",                   text: "text-emerald-700 dark:text-emerald-400" },
              { value: "intermediate", label: "Intermediate", sub: "Some experience", bg: "bg-amber-50 dark:bg-amber-500/10",         active: "bg-amber-500",                     text: "text-amber-700 dark:text-amber-400" },
              { value: "advanced",     label: "Advanced",     sub: "Competitive",    bg: "bg-rose-50 dark:bg-rose-500/10",            active: "bg-rose-600",                      text: "text-rose-700 dark:text-rose-400" },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setSkillLevel(opt.value)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                  skillLevel === opt.value
                    ? `${opt.active} border-transparent text-white`
                    : `${opt.bg} border-slate-200 dark:border-white/8 ${opt.text} hover:border-slate-300 dark:hover:border-white/15`
                }`}>
                <span className="text-xs font-bold leading-tight">{opt.label}</span>
                <span className={`text-[10px] leading-tight ${skillLevel === opt.value ? "text-white/70" : "text-slate-400"}`}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Description <span className="normal-case font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Skill level, equipment needed, anything useful for potential players…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm resize-none focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>
      </div>

      {/* Step 2 — Location & time */}
      <div className="sport-card p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">2</span>
          </div>
          <h2 className="section-heading">Location & Time</h2>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Venue / Turf / Ground <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Nexus Sports Arena, Koramangala"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
            />
          </div>
        </div>

        {/* Date & time */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Date & Time <span className="text-rose-400">*</span>
          </label>
          <input
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
            min={localDatetimeStr(new Date())}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>
      </div>

      {/* Step 3 — Players */}
      <div className="sport-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">3</span>
          </div>
          <h2 className="section-heading">Players Needed</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">Total players including you</p>
            <p className="text-xs text-slate-400 mt-0.5">You&apos;re automatically added as player #1</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMaxPlayers(p => Math.max(2, p - 1))}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xl font-bold flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/8 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all"
            >
              −
            </button>
            <div className="text-center w-12">
              <p className="stat-num text-3xl text-slate-900 dark:text-white">{maxPlayers}</p>
            </div>
            <button
              type="button"
              onClick={() => setMaxPlayers(p => Math.min(20, p + 1))}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xl font-bold flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/8 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all"
            >
              +
            </button>
          </div>
        </div>

        {/* Player slots preview */}
        <div className="flex gap-2 flex-wrap mt-1">
          {Array.from({ length: maxPlayers }, (_, i) => (
            <div key={i} className={`flex items-center justify-center w-9 h-9 rounded-xl border text-xs font-bold transition-all ${
              i === 0
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-dashed border-slate-300 dark:border-white/15 text-slate-300 dark:text-slate-600"
            }`}>
              {i === 0 ? <Users className="w-4 h-4" /> : i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="sport-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ready to post?</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {sport ? `${sport} · ` : ""}{title.trim() || "Your game"} · {maxPlayers} players
          </p>
          {!canSubmit && (
            <p className="text-xs text-amber-500 mt-1">
              {!user ? "Sign in required" : !title.trim() ? "Enter a game title" : !location.trim() ? "Enter a location" : ""}
            </p>
          )}
        </div>
        <button
          onClick={submit}
          disabled={loading || !canSubmit}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-bold text-sm transition-all shadow-glow-blue-sm hover:shadow-glow-violet disabled:shadow-none disabled:cursor-not-allowed flex-shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
          {loading ? "Posting…" : "Post Game"}
        </button>
      </div>
    </div>
  );
}
