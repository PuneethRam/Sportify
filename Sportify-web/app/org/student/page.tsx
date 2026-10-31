"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Activity, TrendingUp, Target, CalendarDays, Check, Clock, Minus, Loader2, Medal } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Stats = {
  name: string;
  email: string;
  clan_points: number;
  matchesplayed: number;
  matcheswon: number;
  matcheslost: number;
};

type TournamentStats = {
  played: number;
  won: number;
  runner_up: number;
};

type AttendanceSummary = {
  totalSessions: number;
  present: number;
  late: number;
  absent: number;
};

type RecentRecord = { session_date: string; status: "present" | "late" | "absent" };

const STATUS_META = {
  present: { icon: <Check className="w-3 h-3" />, bg: "bg-emerald-500", label: "Present" },
  late:    { icon: <Clock className="w-3 h-3" />, bg: "bg-amber-400",   label: "Late"    },
  absent:  { icon: <Minus className="w-3 h-3" />, bg: "bg-rose-500",    label: "Absent"  },
};

function StatCard({ label, value, sub, gradient, icon }: {
  label: string; value: string | number; sub?: string;
  gradient: string; icon: React.ReactNode;
}) {
  return (
    <div className="sport-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">{label}</span>
      </div>
      <div>
        <p className="stat-num text-3xl text-slate-800 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StudentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get("userId");
  const batchId = searchParams.get("batchId");
  const batchName = searchParams.get("batchName") || "Batch";

  const [stats, setStats]           = useState<Stats | null>(null);
  const [tournaments, setTournaments] = useState<TournamentStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [recent, setRecent]         = useState<RecentRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!userId || !batchId) return;
    fetchWithAuth(`/api/organisations/student-stats?userId=${userId}&batchId=${batchId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setStats(d.stats as Stats);
          setTournaments(d.tournaments as TournamentStats);
          setAttendance(d.attendance as AttendanceSummary);
          setRecent(d.recentAttendance as RecentRecord[]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, batchId]);

  if (loading) return (
    <div className="flex flex-col items-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading player stats…</p>
    </div>
  );

  if (!stats) return (
    <div className="flex flex-col items-center py-24 gap-3 text-slate-400">
      <p>Student not found.</p>
      <button onClick={() => router.back()} className="text-blue-400 text-sm hover:underline">Go back</button>
    </div>
  );

  const winRate = stats.matchesplayed > 0
    ? Math.round((stats.matcheswon / stats.matchesplayed) * 100)
    : 0;
  const winBarColor = winRate >= 70 ? "from-emerald-400 to-teal-500" : winRate >= 50 ? "from-blue-400 to-teal-500" : "from-rose-400 to-pink-500";
  const winRateColor = winRate >= 70 ? "text-emerald-500 dark:text-emerald-400" : winRate >= 50 ? "text-blue-500 dark:text-blue-400" : "text-rose-500 dark:text-rose-400";

  const attRate = attendance && attendance.totalSessions > 0
    ? Math.round(((attendance.present + attendance.late) / attendance.totalSessions) * 100)
    : null;
  const attBarColor = attRate === null ? "" : attRate >= 80 ? "from-emerald-400 to-teal-500" : attRate >= 60 ? "from-amber-400 to-orange-400" : "from-rose-400 to-pink-500";
  const attRateColor = attRate === null ? "" : attRate >= 80 ? "text-emerald-500 dark:text-emerald-400" : attRate >= 60 ? "text-amber-500 dark:text-amber-400" : "text-rose-500 dark:text-rose-400";

  const initials = stats.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fade-up pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <p className="text-xs text-slate-400">{batchName}</p>
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-800 dark:text-white leading-none">{stats.name}</h1>
        </div>
      </div>

      {/* Player card */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600" />
        <div className="p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-2xl display-font">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg text-slate-800 dark:text-white truncate">{stats.name}</p>
            <p className="text-sm text-slate-400 truncate">{stats.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="stat-num text-sm text-slate-800 dark:text-white">{Number(stats.clan_points).toFixed(1)}</span>
              <span className="text-xs text-slate-400">pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Match stats grid */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2 px-0.5">Match Stats</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Played"  value={stats.matchesplayed}                gradient="from-blue-500 to-teal-600" icon={<Activity    className="w-4 h-4 text-white" />} />
          <StatCard label="Won"     value={stats.matcheswon}                   gradient="from-emerald-500 to-teal-600"  icon={<Trophy      className="w-4 h-4 text-white" />} />
          <StatCard label="Lost"    value={stats.matcheslost}                  gradient="from-rose-500 to-pink-600"     icon={<Target      className="w-4 h-4 text-white" />} />
          <StatCard label="Points"  value={Number(stats.clan_points).toFixed(1)} gradient="from-amber-400 to-orange-500"  icon={<TrendingUp  className="w-4 h-4 text-white" />} />
        </div>
      </div>

      {/* Tournament stats */}
      {tournaments && (tournaments.played > 0 || tournaments.won > 0) && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2 px-0.5">Tournaments</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Entered"   value={tournaments.played}    gradient="from-blue-500 to-teal-600" icon={<Medal     className="w-4 h-4 text-white" />} />
            <StatCard label="Won"       value={tournaments.won}       gradient="from-amber-400 to-orange-500"  icon={<Trophy    className="w-4 h-4 text-white" />} />
            <StatCard label="Runner-up" value={tournaments.runner_up} gradient="from-slate-500 to-slate-600"   icon={<TrendingUp className="w-4 h-4 text-white" />} />
          </div>
        </div>
      )}

      {/* Win rate bar */}
      <div className="sport-card p-5 space-y-3">
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600 -mx-5 -mt-5 mb-4 rounded-t-2xl" />
        <div className="flex items-center justify-between">
          <h2 className="section-heading flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Win Rate
          </h2>
          <span className={`stat-num text-2xl ${winRateColor}`}>{winRate}%</span>
        </div>
        <div className="h-4 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${winBarColor} transition-all duration-700`} style={{ width: `${winRate}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>{stats.matcheswon}W · {stats.matcheslost}L</span>
          {stats.matchesplayed > 0 && (
            <span>{winRate >= 70 ? "Excellent" : winRate >= 50 ? "Good" : "Needs work"}</span>
          )}
        </div>
      </div>

      {/* Attendance */}
      {attendance && attendance.totalSessions > 0 && (
        <div className="sport-card p-5 space-y-4">
          <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500 -mx-5 -mt-5 mb-4 rounded-t-2xl" />
          <div className="flex items-center justify-between">
            <h2 className="section-heading flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-400" /> Attendance
            </h2>
            {attRate !== null && <span className={`stat-num text-2xl ${attRateColor}`}>{attRate}%</span>}
          </div>

          {attRate !== null && (
            <div className="h-4 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${attBarColor} transition-all duration-700`} style={{ width: `${attRate}%` }} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Present", count: attendance.present, color: "text-emerald-500 dark:text-emerald-400" },
              { label: "Late",    count: attendance.late,    color: "text-amber-500 dark:text-amber-400"   },
              { label: "Absent",  count: attendance.absent,  color: "text-rose-500 dark:text-rose-400"     },
            ].map(({ label, count, color }) => (
              <div key={label} className="rounded-xl bg-slate-50 dark:bg-white/4 border border-slate-100 dark:border-white/6 py-3">
                <p className={`stat-num text-2xl ${color}`}>{count}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400 text-center">{attendance.totalSessions} total sessions</p>

          {/* Recent sessions dots */}
          {recent.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Last {recent.length} sessions</p>
              <div className="flex gap-2 flex-wrap">
                {[...recent].reverse().map((r, i) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <div key={i} title={`${r.session_date} — ${meta.label}`}
                      className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center text-white`}>
                      {meta.icon}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default function StudentPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <StudentContent />
    </Suspense>
  );
}
