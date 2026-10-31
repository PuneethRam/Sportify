"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Trophy, Users, Calendar, Check, Minus, Clock, TrendingUp,
  Share2, Printer, Loader2, AlertTriangle, Medal, Target,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Stats = {
  name: string;
  email: string;
  clan_points: number;
  matchesplayed: number;
  matcheswon: number;
  matcheslost: number;
};

type Tournaments = {
  played: number;
  won: number;
  runner_up: number;
};

type Attendance = {
  totalSessions: number;
  present: number;
  late: number;
  absent: number;
};

type RecentRow = { session_date: string; status: "present" | "absent" | "late" };

type ReportData = {
  stats: Stats;
  tournaments: Tournaments;
  attendance: Attendance;
  recentAttendance: RecentRow[];
};

// ── Radial attendance gauge ────────────────────────────────────────────────────

function AttendanceGauge({ present, late, total }: { present: number; late: number; total: number }) {
  const attended = present + late;
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg viewBox="0 0 96 96" className="-rotate-90 absolute inset-0 w-full h-full">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" className="dark:stroke-white/10" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - pct / 100)}`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div className="relative text-center">
        <p className="stat-num font-black text-2xl leading-none" style={{ color }}>{pct}%</p>
        <p className="text-[10px] text-slate-400 font-semibold">Attended</p>
      </div>
    </div>
  );
}

// ── W/L bar ────────────────────────────────────────────────────────────────────

function WLBar({ won, played, color }: { won: number; played: number; color: string }) {
  const pct = played > 0 ? Math.round((won / played) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-slate-500 dark:text-slate-400">{played} played</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex gap-3 text-xs">
        <span className="text-emerald-500 font-semibold">{won}W</span>
        <span className="text-rose-400 font-semibold">{played - won}L</span>
      </div>
    </div>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: "present" | "absent" | "late" }) {
  const cfg = {
    present: { icon: <Check className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    late:    { icon: <Clock  className="w-3 h-3" />, cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    absent:  { icon: <Minus  className="w-3 h-3" />, cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${cfg.cls}`}>
      {cfg.icon}{status}
    </span>
  );
}

// ── Report content ─────────────────────────────────────────────────────────────

function ReportContent() {
  const searchParams = useSearchParams();
  const userId  = searchParams.get("userId");
  const batchId = searchParams.get("batchId");
  const batchName = searchParams.get("batchName") || "Batch";
  const orgName   = searchParams.get("orgName")   || "Academy";

  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    if (!userId || !batchId) { setError("Missing parameters"); setLoading(false); return; }
    fetchWithAuth(`/api/organisations/student-stats?userId=${userId}&batchId=${batchId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || "Failed to load");
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, batchId]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="flex flex-col items-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading report…</p>
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center py-24 gap-3">
      <AlertTriangle className="w-8 h-8 text-rose-400" />
      <p className="text-slate-400 text-sm">{error || "Could not load report"}</p>
    </div>
  );

  const { stats, tournaments, attendance, recentAttendance } = data;
  const winRate = stats.matchesplayed > 0
    ? Math.round((stats.matcheswon / stats.matchesplayed) * 100)
    : 0;
  const attRate = attendance.totalSessions > 0
    ? Math.round(((attendance.present + attendance.late) / attendance.totalSessions) * 100)
    : 0;

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">

      {/* Action bar — hidden when printing */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="display-font font-bold text-xl text-slate-900 dark:text-white">Progress Report</h1>
          <p className="text-xs text-slate-400">Generated {today}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Share"}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="sport-card overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-blue-500" />
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-black text-2xl flex-shrink-0 shadow">
              {stats.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="display-font font-bold text-2xl text-slate-900 dark:text-white leading-tight">{stats.name}</h2>
              <p className="text-sm text-slate-400 mt-0.5">{orgName} · {batchName}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  Student
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500">
                  {today}
                </span>
              </div>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-white/6">
            {[
              { label: "Total Points", value: stats.clan_points.toFixed(1), color: "text-amber-500", sub: "earned" },
              { label: "Win Rate",     value: `${winRate}%`,                color: winRate >= 60 ? "text-emerald-500" : "text-rose-400", sub: `${stats.matcheswon}W ${stats.matcheslost}L` },
              { label: "Attendance",   value: `${attRate}%`,                color: attRate >= 80 ? "text-emerald-500" : attRate >= 60 ? "text-amber-500" : "text-rose-400", sub: `${attendance.present + attendance.late}/${attendance.totalSessions}` },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="text-center">
                <p className={`stat-num font-black text-2xl ${color}`}>{value}</p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                <p className="text-[10px] text-slate-400">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Attendance card ── */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
        <div className="p-5">
          <h3 className="section-heading flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-emerald-400" /> Attendance
          </h3>

          <div className="flex items-center gap-6">
            <AttendanceGauge present={attendance.present} late={attendance.late} total={attendance.totalSessions} />
            <div className="flex-1 space-y-2">
              {[
                { label: "Present", count: attendance.present, color: "bg-emerald-500" },
                { label: "Late",    count: attendance.late,    color: "bg-amber-400" },
                { label: "Absent",  count: attendance.absent,  color: "bg-rose-400" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">{label}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">{count}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-slate-100 dark:border-white/6 flex items-center gap-2">
                <span className="text-xs text-slate-400 flex-1">Total sessions</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{attendance.totalSessions}</span>
              </div>
            </div>
          </div>

          {/* Recent 10 sessions */}
          {recentAttendance.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Last {recentAttendance.length} sessions</p>
              <div className="flex flex-wrap gap-2">
                {recentAttendance.map((row, i) => {
                  const dt = new Date(row.session_date);
                  const label = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <StatusChip status={row.status} />
                      <span className="text-[9px] text-slate-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Match performance ── */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-blue-400 to-teal-500" />
        <div className="p-5">
          <h3 className="section-heading flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-blue-400" /> Match Performance
          </h3>
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overall</span>
              </div>
              <WLBar won={stats.matcheswon} played={stats.matchesplayed} color="#3b82f6" />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-white/6">
              <div className="text-center rounded-xl bg-slate-50 dark:bg-white/4 p-3">
                <p className="stat-num font-black text-3xl text-slate-800 dark:text-white">{stats.matcheswon}</p>
                <p className="text-xs text-emerald-500 font-semibold mt-0.5">Wins</p>
              </div>
              <div className="text-center rounded-xl bg-slate-50 dark:bg-white/4 p-3">
                <p className="stat-num font-black text-3xl text-slate-800 dark:text-white">{stats.matcheslost}</p>
                <p className="text-xs text-rose-400 font-semibold mt-0.5">Losses</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tournament performance ── */}
      {(tournaments.played > 0 || tournaments.won > 0 || tournaments.runner_up > 0) && (
        <div className="sport-card overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-400" />
          <div className="p-5">
            <h3 className="section-heading flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-amber-400" /> Tournament Record
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Played",    value: tournaments.played,    icon: <TrendingUp className="w-4 h-4 text-blue-400" />,  bg: "bg-blue-50 dark:bg-blue-500/8" },
                { label: "Won",       value: tournaments.won,       icon: <Trophy className="w-4 h-4 text-amber-400" />,     bg: "bg-amber-50 dark:bg-amber-500/8" },
                { label: "Runner-up", value: tournaments.runner_up, icon: <Medal className="w-4 h-4 text-slate-400" />,      bg: "bg-slate-50 dark:bg-white/5" },
              ].map(({ label, value, icon, bg }) => (
                <div key={label} className={`rounded-xl p-4 text-center ${bg}`}>
                  <div className="flex justify-center mb-2">{icon}</div>
                  <p className="stat-num font-black text-2xl text-slate-800 dark:text-white">{value}</p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
        Generated by Sportify · {orgName} · {today}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading report…</p>
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
