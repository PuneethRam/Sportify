"use client";

import React, { useState, useEffect, Suspense } from "react";
import { Users2, User, Trophy, Loader2, Plus, Calendar, TrendingUp, Shield, ChevronRight, Trash2 } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Series = {
  series_id: number;
  clan_id: number;
  series_type: "singles" | "doubles";
  team1_name: string | null;
  team2_name: string | null;
  total_matches: number;
  winner_team: string | null;
  start_date: string;
  end_date: string | null;
};

function SeriesCard({ series, isAdmin, onDelete }: { series: Series; isAdmin: boolean; onDelete: (id: number) => void }) {
  const router = useRouter();
  const isCompleted = series.winner_team !== null;
  const date = new Date(series.start_date);

  const accentGrad = isCompleted ? "from-emerald-500 to-teal-600" : "from-blue-500 to-teal-600";
  const tint = isCompleted
    ? "dark:bg-emerald-950/40 bg-emerald-50 dark:border-emerald-500/15 border-emerald-200"
    : "dark:bg-blue-950/40 bg-blue-50 dark:border-blue-500/15 border-blue-200";

  return (
    <div
      onClick={() => router.push(`/clan/series-matches/series_details?clanId=${series.clan_id}&seriesId=${series.series_id}`)}
      className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-1 ${tint}`}
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 w-[3px] h-full bg-gradient-to-b ${accentGrad} rounded-l-2xl`} />

      {/* Ambient glow */}
      <div className={`absolute -bottom-6 -right-6 w-20 h-20 rounded-full blur-3xl opacity-15 ${isCompleted ? "bg-emerald-500" : "bg-blue-500"}`} />

      <div className="relative pl-5 pr-4 py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accentGrad} flex items-center justify-center flex-shrink-0`}>
              {series.series_type === "singles"
                ? <User className="w-4 h-4 text-white" />
                : <Users2 className="w-4 h-4 text-white" />}
            </div>
            <div className="min-w-0">
              <h3 className="display-font font-bold text-lg sm:text-xl text-slate-900 dark:text-white leading-tight truncate">
                {series.team1_name && series.team2_name
                  ? `${series.team1_name} vs ${series.team2_name}`
                  : `Series #${series.series_id}`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {series.series_type.charAt(0).toUpperCase() + series.series_type.slice(1)} Series
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`badge ${isCompleted ? "badge-completed" : "badge-ongoing"}`}>
              {!isCompleted && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              {isCompleted ? "Completed" : "In Progress"}
            </span>
            {isAdmin && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (confirm("Delete this series and all its matches?")) onDelete(series.series_id);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                title="Delete series"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className={`h-px mb-3 ${isCompleted ? "bg-emerald-200 dark:bg-emerald-500/20" : "bg-blue-200 dark:bg-blue-500/15"}`} />

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {isCompleted ? (
              <span className={`flex items-center gap-1.5 font-medium ${isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
                <Trophy className="w-3.5 h-3.5" />
                {series.winner_team}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {series.total_matches} match{series.total_matches !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="w-3 h-3" />
              {date.toLocaleDateString()}
            </span>
            <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ${isCompleted ? "text-emerald-500" : "text-blue-400"}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_TABS = [
  { id: "all" as const, label: "All" },
  { id: "active" as const, label: "In Progress" },
  { id: "completed" as const, label: "Completed" },
];
const TYPE_TABS = [
  { id: "all" as const, label: "All Types" },
  { id: "singles" as const, label: "Singles" },
  { id: "doubles" as const, label: "Doubles" },
];

function SeriesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const clanId = searchParams.get("clanId");

  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("all");
  const [seriesType, setSeriesType] = useState<"all" | "singles" | "doubles">("all");
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        const res = await fetchWithAuth(`/api/clans/series/get_series?id=${clanId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.success) { setSeriesList(data.data); setError(null); }
        else setError(data.error || "Error");
      } catch { setError("Failed to load series"); }
      finally { setIsLoading(false); }
    };
    load();
  }, [clanId]);

  const deleteSeries = async (seriesId: number) => {
    try {
      const res = await fetchWithAuth(`/api/clans/series/delete_series?seriesId=${seriesId}&clanId=${clanId}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) setSeriesList(prev => prev.filter(s => s.series_id !== seriesId));
      else alert(d.error || "Failed to delete");
    } catch { alert("Failed to delete series"); }
  };

  const filtered = seriesList.filter(s =>
    (activeTab === "all" ? true : activeTab === "active" ? !s.winner_team : s.winner_team !== null) &&
    (seriesType === "all" ? true : s.series_type === seriesType)
  );

  const counts = {
    active: seriesList.filter(s => !s.winner_team).length,
    completed: seriesList.filter(s => s.winner_team !== null).length,
  };

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Stats row */}
      {!isLoading && seriesList.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "In Progress", count: counts.active, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/8 border-blue-200 dark:border-blue-500/15" },
            { label: "Completed", count: counts.completed, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-200 dark:border-emerald-500/15" },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${bg}`}>
              <p className={`stat-num text-2xl ${color}`}>{count}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + CTA */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {STATUS_TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 ${activeTab === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {TYPE_TABS.map(t => (
            <button key={t.id} onClick={() => setSeriesType(t.id)}
              className={`flex-shrink-0 ${seriesType === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Admin CTA */}
      {isAdmin && (
        <button
          onClick={() => clanId && router.push(`/clan/series-matches/create?clanId=${clanId}`)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm hover:shadow-glow-violet"
        >
          <Plus className="w-4 h-4" /> Create New Series
        </button>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading series…</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-400/5 border border-rose-400/20 text-rose-400 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-slate-400" />
          </div>
          <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">No series found</p>
          <p className="text-sm text-slate-400">
            {activeTab !== "all" || seriesType !== "all"
              ? "Try changing your filter settings"
              : "This clan doesn't have any series yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => <SeriesCard key={s.series_id} series={s} isAdmin={isAdmin} onDelete={deleteSeries} />)}
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

export default function SeriesListPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SeriesContent />
    </Suspense>
  );
}
