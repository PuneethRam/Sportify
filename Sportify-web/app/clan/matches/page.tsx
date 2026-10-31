"use client";

import { useState, useEffect, Suspense } from "react";
import { Users2, User, Clock, Trophy, Loader2, Play, Shield } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import PendingResults from "@/app/components/PendingResults";

type MatchScore = { team1: number[]; team2: number[]; };
type Match = {
  id: string | number;
  type: "singles" | "doubles";
  status: "live" | "scheduled" | "completed";
  players: { team1: string[]; team2: string[]; };
  playerIds: { team1: string[]; team2: string[]; };
  scores?: MatchScore;
  winner?: string | number;
  matchDate: string;
  seriesId?: number;
};

function MatchCard({ match }: { match: Match }) {
  const date = new Date(match.matchDate);
  const isLive = match.status === "live";
  const isDone = match.status === "completed";

  const winnerIsTeam1 = isDone && match.winner != null && match.winner === match.playerIds?.team1?.[0];
  const winnerIsTeam2 = isDone && match.winner != null && match.winner === match.playerIds?.team2?.[0];

  const accentGrad = isLive
    ? "from-rose-500 to-red-600"
    : isDone
    ? "from-emerald-500 to-teal-600"
    : "from-blue-500 to-teal-600";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0C0E21] shadow-sm dark:shadow-none transition-all duration-200">

      {/* Top accent — thicker and gradient */}
      <div className={`h-1 w-full bg-gradient-to-r ${accentGrad}`} />

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${
              match.type === "singles"
                ? "bg-teal-500/10 border border-teal-400/20"
                : "bg-purple-500/10 border border-purple-400/20"
            }`}>
              {match.type === "singles"
                ? <User className="w-3.5 h-3.5 text-teal-400" />
                : <Users2 className="w-3.5 h-3.5 text-purple-400" />}
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {match.type}
            </span>
          </div>
          <span className={`badge ${isLive ? "badge-live" : isDone ? "badge-completed" : "badge-ongoing"}`}>
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
            {match.status === "live" ? "Live" : match.status === "completed" ? "Completed" : "Upcoming"}
          </span>
        </div>

        {/* ── Scoreboard ── */}
        <div className="space-y-1.5">
          {/* Team 1 */}
          <div className={`flex items-center justify-between rounded-xl px-3 sm:px-4 py-3 border transition-colors ${
            winnerIsTeam1
              ? "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-300 dark:border-emerald-500/25"
              : "bg-slate-50 dark:bg-white/4 border-slate-100 dark:border-white/5"
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {winnerIsTeam1 && (
                <Trophy className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
              )}
              {!winnerIsTeam1 && isDone && (
                <div className="w-4 flex-shrink-0" />
              )}
              <div className="min-w-0">
                {match.players.team1.map((p, i) => (
                  <p key={i} className={`font-bold text-sm sm:text-base truncate ${
                    winnerIsTeam1
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-800 dark:text-white"
                  }`}>{p}</p>
                ))}
              </div>
            </div>
            {match.scores && (
              <div className="flex gap-3 ml-3 flex-shrink-0">
                {match.scores.team1.map((s, i) => (
                  <span key={i} className={`stat-num text-2xl sm:text-3xl min-w-[2rem] text-center ${
                    winnerIsTeam1
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-700 dark:text-slate-200"
                  }`}>{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* VS divider */}
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">VS</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
          </div>

          {/* Team 2 */}
          <div className={`flex items-center justify-between rounded-xl px-3 sm:px-4 py-3 border transition-colors ${
            winnerIsTeam2
              ? "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-300 dark:border-emerald-500/25"
              : "bg-slate-50 dark:bg-white/4 border-slate-100 dark:border-white/5"
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {winnerIsTeam2 && (
                <Trophy className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
              )}
              {!winnerIsTeam2 && isDone && (
                <div className="w-4 flex-shrink-0" />
              )}
              <div className="min-w-0">
                {match.players.team2.map((p, i) => (
                  <p key={i} className={`font-bold text-sm sm:text-base truncate ${
                    winnerIsTeam2
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-800 dark:text-white"
                  }`}>{p}</p>
                ))}
              </div>
            </div>
            {match.scores && (
              <div className="flex gap-3 ml-3 flex-shrink-0">
                {match.scores.team2.map((s, i) => (
                  <span key={i} className={`stat-num text-2xl sm:text-3xl min-w-[2rem] text-center ${
                    winnerIsTeam2
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-700 dark:text-slate-200"
                  }`}>{s}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {date.toLocaleString()}
          </div>
          {isLive && (
            <div className="flex items-center gap-1 text-xs font-bold text-rose-500 animate-pulse">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
              LIVE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "all",      label: "All" },
  { id: "live",     label: "🔴 Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "recent",   label: "Recent" },
] as const;
const TYPE_TABS = [
  { id: "all",     label: "All" },
  { id: "singles", label: "Singles" },
  { id: "doubles", label: "Doubles" },
] as const;

function MatchesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const clanId = searchParams.get("clanId");

  const [activeTab, setActiveTab]  = useState<"all" | "live" | "upcoming" | "recent">("all");
  const [matchType, setMatchType]  = useState<"all" | "singles" | "doubles">("all");
  const [matches, setMatches]      = useState<Match[]>([]);
  const [isLoading, setIsLoading]  = useState(true);
  const [error, setError]          = useState<string | null>(null);
  const [isAdmin, setIsAdmin]      = useState(false);
  const [reloadKey, setReloadKey]  = useState(0);

  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(user => {
      if (user && clanId) checkAdmin(user.uid, clanId);
      else setIsAdmin(false);
    });
    return () => unsub();
  }, [clanId]);

  async function checkAdmin(userId: string, clanId: string) {
    try {
      const res = await fetchWithAuth(`/api/clans/checkadmin?userId=${userId}&clanId=${clanId}`);
      if (res.ok) { const d = await res.json(); setIsAdmin(d.isAdmin === true); }
    } catch {}
  }

  useEffect(() => {
    if (!clanId) { setError("No clan ID provided"); setIsLoading(false); return; }
    const load = async () => {
      try {
        const res = await fetchWithAuth(`/api/clans/get_matches?id=${clanId}`);
        if (!res.ok) throw new Error("Failed to fetch matches");
        const data = await res.json();
        if (data.success) { setMatches(data.data.all); setError(null); }
        else setError(data.error || "An error occurred");
      } catch { setError("Failed to load matches"); }
      finally { setIsLoading(false); }
    };
    load();
  }, [clanId, reloadKey]);

  const filtered = matches.filter(m => {
    const byStatus =
      activeTab === "all"      ? true :
      activeTab === "live"     ? m.status === "live" :
      activeTab === "upcoming" ? m.status === "scheduled" :
      m.status === "completed";
    const byType = matchType === "all" ? true : m.type === matchType;
    return byStatus && byType;
  });

  const liveCount = matches.filter(m => m.status === "live").length;

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 ${activeTab === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
              {t.label}
              {t.id === "live" && liveCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">{liveCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {TYPE_TABS.map(t => (
            <button key={t.id} onClick={() => setMatchType(t.id)}
              className={`flex-shrink-0 ${matchType === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {clanId && <PendingResults clanId={clanId} onResolved={() => setReloadKey(k => k + 1)} />}

      {/* Admin CTA */}
      {isAdmin && (
        <button
          onClick={() => clanId && router.push(`/clan/matches/start?clanId=${clanId}`)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm hover:shadow-glow-violet"
        >
          <Play className="w-4 h-4" /> Start New Match
        </button>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading matches…</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-400/5 border border-rose-400/20 text-rose-400 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm font-medium">
            {activeTab !== "all" || matchType !== "all" ? "Try changing your filters" : "No matches yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => <MatchCard key={`${m.type}-${m.id}`} match={m} />)}
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex flex-col items-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );
}

export default function ClanMatchesPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MatchesContent />
    </Suspense>
  );
}
