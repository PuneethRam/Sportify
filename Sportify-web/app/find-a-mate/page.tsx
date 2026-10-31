"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  MapPin, Clock, Users, Plus, Loader2, Search,
  Handshake, Timer, ChevronDown, ChevronRight, X, RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type SkillLevel = "any" | "beginner" | "intermediate" | "advanced";

type GameSession = {
  session_id: number;
  host_user_id: string;
  host_name: string | null;
  title: string;
  sport: string | null;
  location: string;
  scheduled_at: string;
  max_players: number;
  description: string | null;
  status: "open" | "full" | "completed" | "cancelled";
  joined_count: number;
  skill_level: SkillLevel;
};

// ── Sport config ──────────────────────────────────────────────────────────────

const SPORT_CFG: Record<string, { color: string; bg: string; emoji: string }> = {
  Badminton:      { color: "#6366f1", bg: "rgba(99,102,241,0.12)",  emoji: "🏸" },
  Tennis:         { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  emoji: "🎾" },
  Football:       { color: "#10b981", bg: "rgba(16,185,129,0.12)",  emoji: "⚽" },
  Cricket:        { color: "#f97316", bg: "rgba(249,115,22,0.12)",  emoji: "🏏" },
  Basketball:     { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   emoji: "🏀" },
  Pickleball:     { color: "#14b8a6", bg: "rgba(20,184,166,0.12)",  emoji: "🥒" },
  "Table Tennis": { color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  emoji: "🏓" },
  Other:          { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",  emoji: "🎮" },
};

function getSport(sport: string | null) {
  if (!sport) return SPORT_CFG.Other;
  return SPORT_CFG[sport] ?? SPORT_CFG.Other;
}

// ── Skill config ──────────────────────────────────────────────────────────────

const SKILL_CFG: Record<SkillLevel, { label: string; color: string; bg: string; activeBg: string }> = {
  any:          { label: "Any Level",    color: "#94a3b8", bg: "rgba(148,163,184,0.12)", activeBg: "#475569" },
  beginner:     { label: "Beginner",     color: "#10b981", bg: "rgba(16,185,129,0.12)", activeBg: "#059669" },
  intermediate: { label: "Intermediate", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", activeBg: "#d97706" },
  advanced:     { label: "Advanced",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",  activeBg: "#dc2626" },
};

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(scheduledAt: string) {
  const compute = () => {
    const diff = new Date(scheduledAt).getTime() - Date.now();
    if (diff <= 0) {
      const ago = Math.floor(-diff / 60000);
      if (ago < 5)   return { label: "Starting now", urgent: true,  started: true };
      if (ago < 120) return { label: `${ago}m ago`,  urgent: false, started: true };
      return { label: null, urgent: false, started: false };
    }
    const mins  = Math.floor(diff / 60000);
    const hrs   = Math.floor(mins / 60);
    const rem   = mins % 60;
    const today = new Date(scheduledAt).toDateString() === new Date().toDateString();
    if (!today) return { label: null, urgent: false, started: false };
    if (hrs === 0) return { label: `${mins}m`,                             urgent: true,  started: false };
    if (hrs < 3)   return { label: `${hrs}h${rem > 0 ? ` ${rem}m` : ""}`, urgent: true,  started: false };
    return          { label: `${hrs}h${rem > 0 ? ` ${rem}m` : ""}`,       urgent: false, started: false };
  };
  const [state, setState] = useState(compute);
  useEffect(() => {
    const iv = setInterval(() => setState(compute()), 30_000);
    return () => clearInterval(iv);
  }, [scheduledAt]);
  return state;
}

// ── Player dots ───────────────────────────────────────────────────────────────

function PlayerDots({ joined, max, color }: { joined: number; max: number; color: string }) {
  const show   = Math.min(max, 12);
  const filled = Math.min(joined, show);
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: show }, (_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width:      i < filled ? 8 : 6,
              height:     i < filled ? 8 : 6,
              background: i < filled ? color : "rgba(148,163,184,0.2)",
              boxShadow:  i < filled ? `0 0 5px ${color}88` : "none",
              transition: "all 0.2s",
            }}
          />
        ))}
        {max > 12 && <span className="text-[10px] text-slate-400 ml-0.5">+{max - 12}</span>}
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: `${color}bb` }}>
        {joined}/{max}
      </span>
    </div>
  );
}

// ── Sport dropdown ────────────────────────────────────────────────────────────

const ALL_SPORTS = ["All", "Badminton", "Tennis", "Pickleball", "Football", "Cricket", "Basketball", "Table Tennis", "Other"];

function SportDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const cfg   = value !== "All" ? getSport(value) : null;
  const isAll = value === "All";

  const btnStyle = !isAll && cfg
    ? { background: cfg.color, borderColor: cfg.color, color: "#fff" }
    : {};

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(p => !p)}
        style={btnStyle}
        className={`flex items-center gap-2 pl-3.5 pr-3 py-2.5 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap ${
          isAll
            ? "bg-white dark:bg-[#0C0E21] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/20"
            : "border-transparent"
        }`}>
        {cfg && <span className="text-sm leading-none">{cfg.emoji}</span>}
        <span>{isAll ? "All Sports" : value}</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 w-52 z-30 bg-white dark:bg-[#13162D] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-black/60 overflow-hidden">
          <div className="p-1.5">
            {ALL_SPORTS.map(s => {
              const c          = s !== "All" ? getSport(s) : null;
              const isSelected = s === value;
              return (
                <button key={s} onClick={() => { onChange(s); setOpen(false); }}
                  style={isSelected && c ? { background: c.bg, color: c.color } : isSelected ? { background: "rgba(100,116,139,0.12)", color: "#94a3b8" } : {}}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left transition-colors ${
                    isSelected ? "font-semibold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}>
                  {c
                    ? <span className="text-base w-5 text-center leading-none">{c.emoji}</span>
                    : <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/8 flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      </div>
                  }
                  <span className="flex-1">{s === "All" ? "All Sports" : s}</span>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c?.color ?? "#94a3b8" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session, isHost, onView }: { session: GameSession; isHost: boolean; onView: () => void }) {
  const isFull  = session.status === "full" || Number(session.joined_count) >= session.max_players;
  const sport   = getSport(session.sport);
  const skill   = SKILL_CFG[session.skill_level ?? "any"];
  const { label: cd, urgent, started } = useCountdown(session.scheduled_at);
  const dt       = new Date(session.scheduled_at);
  const timeStr  = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isToday  = dt.toDateString() === new Date().toDateString();
  const isTom    = new Date(dt.getTime() - 86400000).toDateString() === new Date().toDateString();
  const dateStr  = isToday ? "Today" : isTom ? "Tomorrow" : dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <button onClick={onView} className="group w-full text-left focus:outline-none">
      <div className="relative bg-white dark:bg-[#0D0F23] rounded-2xl overflow-hidden border border-slate-100 dark:border-white/6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:hover:shadow-black/50 hover:border-slate-200 dark:hover:border-white/12">

        {/* Top accent line */}
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${sport.color}, ${sport.color}55)` }} />

        <div className="px-4 pt-3.5 pb-4">

          {/* Row 1: sport pill + skill + host tag | countdown + status */}
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider"
                style={{ background: sport.bg, color: sport.color }}>
                <span className="text-sm leading-none">{sport.emoji}</span>
                {session.sport ?? "Sport"}
              </div>
              {session.skill_level && session.skill_level !== "any" && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: skill.bg, color: skill.color }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: skill.color }} />
                  {skill.label}
                </div>
              )}
              {isHost && (
                <div className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-400">
                  Your game
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {cd && (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${
                  started ? "bg-emerald-400/15 text-emerald-400" :
                  urgent  ? "bg-orange-400/15 text-orange-400"   :
                            "bg-slate-100 text-slate-500 dark:bg-white/6 dark:text-slate-400"
                }`}>
                  <Timer className={`w-3 h-3 ${urgent && !started ? "animate-pulse" : ""}`} />
                  {cd}
                </div>
              )}
              <div className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                isFull
                  ? "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400"
                  : "bg-blue-500/12 text-blue-600 dark:text-blue-400"
              }`}>
                {isFull ? "Full" : "Open"}
              </div>
            </div>
          </div>

          {/* Title + host */}
          <h3 className="display-font font-bold text-[17px] sm:text-[19px] text-slate-900 dark:text-white leading-tight tracking-tight mb-0.5">
            {session.title}
          </h3>
          <p className="text-xs text-slate-400 mb-3">by {session.host_name ?? "someone"}</p>

          {/* Location + time */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sport.color }} />
              <span className="truncate">{session.location}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sport.color }} />
              {dateStr} · {timeStr}
            </span>
          </div>

          {/* Player dots + view CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
            <PlayerDots joined={Number(session.joined_count)} max={session.max_players} color={sport.color} />
            <span
              className="flex items-center gap-1 text-xs font-bold opacity-50 group-hover:opacity-100 transition-all duration-200 group-hover:gap-1.5"
              style={{ color: sport.color }}>
              View game
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SKILL_OPTIONS: { value: SkillLevel | "All"; label: string }[] = [
  { value: "All",          label: "Any level" },
  { value: "beginner",     label: "Beginner"  },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced"  },
];

export default function FindAMatePage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessions,      setSessions]      = useState<GameSession[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [sportFilter,   setSportFilter]   = useState("All");
  const [skillFilter,   setSkillFilter]   = useState<SkillLevel | "All">("All");

  useEffect(() => {
    const auth = getAuth();
    return auth.onAuthStateChanged(u => setCurrentUserId(u?.uid ?? null));
  }, []);

  const load = () => {
    setLoading(true);
    fetchWithAuth("/api/game-sessions")
      .then(r => r.json())
      .then(d => setSessions(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = sessions.filter(s => {
    if (sportFilter !== "All" && s.sport !== sportFilter) return false;
    if (skillFilter !== "All" && s.skill_level !== skillFilter) return false;
    const q = search.toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || s.location.toLowerCase().includes(q) || (s.sport ?? "").toLowerCase().includes(q);
  });

  const open       = filtered.filter(s => s.status !== "full" && Number(s.joined_count) < s.max_players);
  const full       = filtered.filter(s => s.status === "full" || Number(s.joined_count) >= s.max_players);
  const todayCount = sessions.filter(s => new Date(s.scheduled_at).toDateString() === new Date().toDateString()).length;
  const hasFilters = sportFilter !== "All" || skillFilter !== "All" || search !== "";

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white leading-none">
            Find a Game
          </h1>
          <p className="text-xs text-slate-400 mt-1.5">
            {todayCount > 0
              ? <><span className="font-semibold text-blue-400">{todayCount}</span> happening today</>
              : "Join a pickup game near you"}
          </p>
        </div>
        <button onClick={() => router.push("/find-a-mate/create")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm flex-shrink-0">
          <Plus className="w-4 h-4" /> Host
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2.5">

        {/* Row 1: search + sport dropdown */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search games or venues…"
              className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0C0E21] text-slate-800 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
          <SportDropdown value={sportFilter} onChange={setSportFilter} />
        </div>

        {/* Row 2: skill level pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">Level</span>
          {SKILL_OPTIONS.map(({ value, label }) => {
            const selected = skillFilter === value;
            const cfg      = SKILL_CFG[value as SkillLevel];
            return (
              <button
                key={value}
                onClick={() => setSkillFilter(value)}
                style={
                  selected
                    ? { background: cfg?.activeBg ?? "#475569", color: "#fff" }
                    : { background: cfg?.bg ?? "rgba(148,163,184,0.12)", color: cfg?.color ?? "#94a3b8" }
                }
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all">
                {label}
              </button>
            );
          })}
          {hasFilters && (
            <button
              onClick={() => { setSportFilter("All"); setSkillFilter("All"); setSearch(""); }}
              className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center py-24 gap-3">
          <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Finding games…</p>
        </div>

      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/8 p-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Handshake className="w-7 h-7 text-blue-400" />
          </div>
          <p className="font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            {sessions.length === 0 ? "No games posted yet" : "No games match your filters"}
          </p>
          <p className="text-sm text-slate-400 mb-5">
            {sessions.length === 0 ? "Be the first to host a game" : "Try clearing your filters"}
          </p>
          {sessions.length === 0 ? (
            <button onClick={() => router.push("/find-a-mate/create")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">
              <Plus className="w-4 h-4" /> Host a Game
            </button>
          ) : (
            <button onClick={() => { setSportFilter("All"); setSkillFilter("All"); setSearch(""); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear all filters
            </button>
          )}
        </div>

      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Open · {open.length}</h2>
              </div>
              <div className="space-y-3">
                {open.map(s => (
                  <SessionCard key={s.session_id} session={s}
                    isHost={s.host_user_id === currentUserId}
                    onView={() => router.push(`/find-a-mate/${s.session_id}`)} />
                ))}
              </div>
            </section>
          )}
          {full.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Full · {full.length}</h2>
              </div>
              <div className="space-y-3 opacity-60">
                {full.map(s => (
                  <SessionCard key={s.session_id} session={s}
                    isHost={s.host_user_id === currentUserId}
                    onView={() => router.push(`/find-a-mate/${s.session_id}`)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <span>{sessions.length} game{sessions.length !== 1 ? "s" : ""} listed</span>
          <span>·</span>
          <button onClick={load} className="flex items-center gap-1 font-medium text-blue-400 hover:text-blue-300 transition-colors">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      )}
    </div>
  );
}
