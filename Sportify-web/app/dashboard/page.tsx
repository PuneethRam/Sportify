"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy, User, Users, Activity, Shield, Flame, Star, Medal, Zap, TrendingUp,
  Building2, AlertTriangle, Calendar, ChevronRight, Clock, CheckCircle,
} from "lucide-react";
import ProtectedRoute from "../components/ProtectedRoute";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

// ── Types ────────────────────────────────────────────────────────────────────

interface ClanData   { clan_id: string; name: string; clan_points: number; }
interface PlayerStat { name: string; wins?: number; losses?: number; }
interface ClanStats {
  clan_id: string; clan_points: number;
  singles_played: number; singles_won: number;
  doubles_played: number; doubles_won: number;
  series_singles_played: number; series_singles_won: number;
  series_doubles_played: number; series_doubles_won: number;
  tournaments_played: number; tournaments_won: number; runner_up: number;
}
interface UserData {
  user_id: string; name: string; email: string; global_pts: number;
  currentStreak: number; bestStreak: number; clans: ClanData[];
  stats: { singles_played: number; singles_won: number; doubles_played: number; doubles_won: number; };
  mostWinsAgainst: PlayerStat[]; mostLossesAgainst: PlayerStat[];
  activeClanStats?: ClanStats;
}

interface BatchInfo {
  clan_id: number; name: string; org_id: number;
  member_count: number; total_sessions: number;
  attendance_rate: number; at_risk_count: number;
}
interface UpcomingSession {
  session_id: number; org_id: number; title: string;
  scheduled_at: string; duration_minutes: number; org_name: string;
}
interface Academy {
  org_id: number; name: string;
  batches: BatchInfo[];
  total_students: number;
  avg_attendance: number;
  upcoming_sessions: UpcomingSession[];
}
interface AtRiskStudent {
  user_id: string; name: string; batch_id: number; batch_name: string; rate: number;
}
interface CoachData {
  academies: Academy[];
  atRiskStudents: AtRiskStudent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const wr = (won: number, played: number) =>
  played > 0 ? Math.round((won / played) * 100) : 0;

function attendanceColor(rate: number) {
  if (rate >= 75) return { bar: "#10b981", bg: "rgba(16,185,129,0.12)", text: "#10b981", label: "Good" };
  if (rate >= 50) return { bar: "#f59e0b", bg: "rgba(245,158,11,0.12)",  text: "#f59e0b", label: "Fair" };
  return             { bar: "#ef4444", bg: "rgba(239,68,68,0.12)",   text: "#ef4444", label: "Low"  };
}

function fmtSessionTime(iso: string) {
  const d = new Date(iso);
  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const day      = new Date(d); day.setHours(0,0,0,0);
  const time     = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (day.getTime() === today.getTime())    return `Today · ${time}`;
  if (day.getTime() === tomorrow.getTime()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

// ── Shared components ─────────────────────────────────────────────────────────

function DonutRing({ won, played, accent }: { won: number; played: number; accent: string }) {
  const pct  = played > 0 ? Math.min(100, Math.round((won / played) * 100)) : 0;
  const circ = 2 * Math.PI * 28;
  return (
    <div className="relative w-[72px] h-[72px] flex-shrink-0">
      <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
        <circle cx="36" cy="36" r="28" fill="none" stroke="#334155" strokeWidth="8" />
        <circle cx="36" cy="36" r="28" fill="none" stroke={accent}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - pct / 100)}`}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black text-slate-800 dark:text-white leading-none"
          style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
    </div>
  );
}

function WinLossBar({ won, played, className = "" }: { won: number; played: number; className?: string }) {
  const lost   = played - won;
  const winPct = played > 0 ? Math.round((won / played) * 100) : 0;
  return (
    <div className={`rounded-xl border border-slate-100 dark:border-white/6 bg-white dark:bg-white/[0.03] overflow-hidden ${className}`}>
      <div className="flex">
        <div className="flex items-center gap-1.5 px-3 py-2"
          style={{ width: `${Math.max(winPct, 8)}%`, background: "rgba(34,197,94,0.08)" }}>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400"
            style={{ fontVariantNumeric: "tabular-nums" }}>{won}W</span>
        </div>
        <div className="flex items-center justify-end gap-1.5 px-3 py-2 flex-1"
          style={{ background: "rgba(244,63,94,0.06)" }}>
          <span className="text-sm font-black text-rose-500 dark:text-rose-400"
            style={{ fontVariantNumeric: "tabular-nums" }}>{lost}L</span>
        </div>
      </div>
      <div className="h-1.5 flex">
        <div style={{ width: `${winPct}%`, background: "#22C55E", transition: "width 0.9s ease" }} />
        <div style={{ flex: 1, background: "#F43F5E", opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ── Coach dashboard ───────────────────────────────────────────────────────────

function CoachDashboard({ data, userName }: { data: CoachData; userName: string }) {
  const router  = useRouter();
  const academy = data.academies[0]; // primary academy
  if (!academy) return null;

  const totalBatches  = academy.batches.length;
  const totalStudents = academy.total_students;
  const avgAtt        = academy.avg_attendance;
  const initials      = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-3 animate-fade-up">

      {/* ── Coach hero ── */}
      <div className="rounded-3xl overflow-hidden shadow-xl"
        style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2b1e 55%, #053320 100%)" }}>
        <div className="relative px-5 pt-6 pb-0">
          <svg className="absolute top-0 right-0 opacity-[0.06]" width="180" height="120" viewBox="0 0 180 120">
            <rect x="20" y="10" width="140" height="100" fill="none" stroke="white" strokeWidth="1"/>
            <line x1="90" y1="10" x2="90" y2="110" stroke="white" strokeWidth="0.8"/>
            <circle cx="90" cy="60" r="22" fill="none" stroke="white" strokeWidth="0.8"/>
          </svg>

          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-3xl flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-emerald-300"
                  style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.3)" }}>
                  Coach
                </span>
              </div>
              <h1 className="font-black text-white leading-none mb-1 truncate"
                style={{ fontSize: "clamp(1.3rem,4.5vw,1.9rem)", letterSpacing: "-0.02em" }}>
                {userName}
              </h1>
              <p className="text-emerald-400/80 text-xs truncate">{academy.name}</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4 pb-5">
            {[
              { label: "Students",  value: totalStudents },
              { label: "Batches",   value: totalBatches  },
              { label: "Avg Att.",  value: `${avgAtt}%`  },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-0.5 px-2">
                <span className="text-white font-black text-2xl leading-none"
                  style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Batches ── */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-heading flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" /> Batches
            </h2>
            <button onClick={() => router.push(`/org/${academy.org_id}`)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 transition-colors">
              Manage <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {academy.batches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400 mb-3">No batches yet</p>
              <button onClick={() => router.push(`/org/${academy.org_id}`)}
                className="text-xs text-emerald-400 font-semibold hover:text-emerald-300 transition-colors">
                Create your first batch →
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {academy.batches.map(batch => {
                const col = attendanceColor(Number(batch.attendance_rate));
                return (
                  <button key={batch.clan_id}
                    onClick={() => router.push(`/org/batch?batchId=${batch.clan_id}&orgId=${academy.org_id}&batchName=${encodeURIComponent(batch.name)}&orgName=${encodeURIComponent(academy.name)}`)}
                    className="group w-full text-left bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/6 border border-slate-100 dark:border-white/6 rounded-2xl p-3.5 transition-all">

                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-white">{batch.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5"
                          style={{ fontVariantNumeric: "tabular-nums" }}>
                          {batch.member_count} students · {batch.total_sessions} sessions
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {Number(batch.at_risk_count) > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {batch.at_risk_count} at risk
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-400 transition-colors" />
                      </div>
                    </div>

                    {/* Attendance bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: col.text }}>
                          {col.label} attendance
                        </span>
                        <span className="text-[11px] font-black tabular-nums" style={{ color: col.text }}>
                          {batch.attendance_rate}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/8 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${batch.attendance_rate}%`, background: col.bar }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── At-risk students ── */}
      {data.atRiskStudents.length > 0 && (
        <div className="sport-card overflow-hidden">
          <div className="h-0.5" style={{ background: "#ef4444" }} />
          <div className="p-4 sm:p-5">
            <h2 className="section-heading mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Needs Attention
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                &lt; 60% attendance
              </span>
            </h2>
            <div className="space-y-2">
              {data.atRiskStudents.map(s => (
                <button key={`${s.user_id}-${s.batch_id}`}
                  onClick={() => router.push(`/org/report?userId=${s.user_id}&batchId=${s.batch_id}&batchName=${encodeURIComponent(s.batch_name)}&orgName=${encodeURIComponent(academy.name)}`)}
                  className="group w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50/50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/15 hover:border-rose-300 dark:hover:border-rose-500/30 transition-all">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: "rgba(239,68,68,0.7)" }}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.name}</p>
                    <p className="text-xs text-slate-400 truncate">{s.batch_name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-black tabular-nums text-rose-500">{s.rate}%</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-rose-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Upcoming sessions ── */}
      {academy.upcoming_sessions.length > 0 && (
        <div className="sport-card overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-blue-500 to-indigo-400" />
          <div className="p-4 sm:p-5">
            <h2 className="section-heading mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" /> Upcoming Sessions
            </h2>
            <div className="space-y-2">
              {academy.upcoming_sessions.map(s => (
                <div key={s.session_id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/15">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.title}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtSessionTime(s.scheduled_at)} · {s.duration_minutes}m
                    </p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Multi-academy link */}
      {data.academies.length > 1 && (
        <button onClick={() => router.push("/academy")}
          className="w-full sport-card p-3.5 flex items-center gap-3 hover:border-emerald-400/30 transition-all">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1 text-left">
            View all {data.academies.length} academies
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      )}
    </div>
  );
}

// ── Player dashboard (existing) ───────────────────────────────────────────────

function PlayerDashboard({ userData, globalTournaments, selectedClan, setSelectedClan, isLoadingClanStats }: {
  userData: UserData;
  globalTournaments: { played: number; won: number; runner_up: number };
  selectedClan: string | null;
  setSelectedClan: (id: string) => void;
  isLoadingClanStats: boolean;
}) {
  const cs         = userData.activeClanStats;
  const totalPlayed = userData.stats.singles_played + userData.stats.doubles_played;
  const totalWon    = userData.stats.singles_won    + userData.stats.doubles_won;
  const initials    = userData.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const overallPct  = wr(totalWon, totalPlayed);

  return (
    <div className="space-y-3">

      {/* Hero */}
      <div className="rounded-3xl overflow-hidden shadow-xl"
        style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 60%, #0E7490 100%)" }}>
        <div className="relative px-5 pt-6 pb-0">
          <svg className="absolute top-0 right-0 opacity-[0.07]" width="200" height="130" viewBox="0 0 200 130">
            <circle cx="170" cy="25" r="70" fill="none" stroke="white" strokeWidth="1"/>
            <circle cx="170" cy="25" r="45" fill="none" stroke="white" strokeWidth="1"/>
            <line x1="0" y1="65" x2="200" y2="65" stroke="white" strokeWidth="0.8"/>
          </svg>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-3xl"
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.18)" }}>
                {initials}
              </div>
              {userData.currentStreak > 3 && (
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
                  <Flame className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-white leading-none mb-1.5 truncate"
                style={{ fontSize: "clamp(1.4rem,5vw,2rem)", letterSpacing: "-0.02em" }}>
                {userData.name}
              </h1>
              <p className="text-sky-300 text-xs mb-2 truncate">Badminton Player</p>
              <div className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 font-black text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {userData.global_pts.toLocaleString()}
                </span>
                <span className="text-white/40 text-xs font-medium">global pts</span>
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4 pb-5">
            {[
              { label: "Matches",  value: totalPlayed },
              { label: "Win rate", value: `${overallPct}%` },
              { label: "Streak",   value: userData.currentStreak > 0 ? `${userData.currentStreak} 🔥` : userData.currentStreak },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-0.5 px-2">
                <span className="text-white font-black text-2xl leading-none"
                  style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global Performance */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-sky-400 to-teal-500" />
        <div className="p-4 sm:p-5">
          <h2 className="section-heading mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" /> Global Performance
          </h2>
          {totalPlayed > 0 && <WinLossBar won={totalWon} played={totalPlayed} className="mb-4" />}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Singles", played: userData.stats.singles_played, won: userData.stats.singles_won,
                icon: <User className="w-3.5 h-3.5" />, accent: "#0EA5E9",
                iconBg: "bg-sky-100 dark:bg-sky-500/15", iconColor: "text-sky-600 dark:text-sky-400" },
              { label: "Doubles", played: userData.stats.doubles_played, won: userData.stats.doubles_won,
                icon: <Users className="w-3.5 h-3.5" />, accent: "#A855F7",
                iconBg: "bg-violet-100 dark:bg-violet-500/15", iconColor: "text-violet-600 dark:text-violet-400" },
            ].map(({ label, played, won, icon, accent, iconBg, iconColor }) => (
              <div key={label} className="rounded-2xl border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] p-4 flex flex-col items-center gap-3">
                <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${iconColor}`}>
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</span>
                  {label}
                </div>
                <DonutRing won={won} played={played} accent={accent} />
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{won}W</span>
                  <span>·</span>
                  <span className="font-semibold text-rose-500 dark:text-rose-400">{played - won}L</span>
                  <span>·</span>
                  <span>{played}P</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trophy Cabinet */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
        <div className="p-4 sm:p-5">
          <h2 className="section-heading mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> Trophy Cabinet
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
            {[
              { emoji: "🏆", count: globalTournaments.won,       label: "Champion",  bg: "bg-amber-50 dark:bg-amber-400/8",  border: "border-amber-200/60 dark:border-amber-400/20", num: "text-amber-500 dark:text-amber-400" },
              { emoji: "🥈", count: globalTournaments.runner_up,  label: "Runner-Up", bg: "bg-slate-50 dark:bg-white/4",       border: "border-slate-200 dark:border-white/8",         num: "text-slate-500 dark:text-slate-400" },
              { emoji: "🎯", count: globalTournaments.played,     label: "Entered",   bg: "bg-sky-50 dark:bg-sky-400/8",      border: "border-sky-200/60 dark:border-sky-400/20",     num: "text-sky-500 dark:text-sky-400" },
            ].map(({ emoji, count, label, bg, border, num }) => (
              <div key={label} className={`flex flex-col items-center p-3 sm:p-4 rounded-2xl border ${bg} ${border}`}>
                <span className="text-2xl mb-1.5">{emoji}</span>
                <span className={`font-black text-2xl sm:text-3xl ${count > 0 ? num : "text-slate-300 dark:text-slate-600"}`}
                  style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wide">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-orange-50 dark:bg-orange-400/8 border border-orange-200/60 dark:border-orange-400/20">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                <Flame className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Streak</p>
                <p className="font-black text-2xl text-orange-500 leading-none"
                  style={{ fontVariantNumeric: "tabular-nums" }}>{userData.currentStreak}
                  <span className="text-sm font-normal text-slate-400 ml-1">W</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-sky-50 dark:bg-sky-400/8 border border-sky-200/60 dark:border-sky-400/20">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                <Medal className="w-5 h-5 text-sky-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Best ever</p>
                <p className="font-black text-2xl text-sky-500 leading-none"
                  style={{ fontVariantNumeric: "tabular-nums" }}>{userData.bestStreak}
                  <span className="text-sm font-normal text-slate-400 ml-1">W</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clan Performance */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-teal-500 to-sky-500" />
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="section-heading flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-400" /> Clan Performance
            </h2>
            {userData.clans?.length > 0 && (
              <select value={selectedClan || ""}
                onChange={e => setSelectedClan(e.target.value)}
                className="text-xs bg-slate-100 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-400 max-w-[140px]">
                {userData.clans.map(c => <option key={c.clan_id} value={c.clan_id}>{c.name}</option>)}
              </select>
            )}
          </div>
          {isLoadingClanStats ? (
            <div className="py-10 flex justify-center">
              <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : cs ? (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "linear-gradient(135deg, #0F3040 0%, #0E4F3A 100%)", border: "1px solid rgba(20,184,166,0.25)" }}>
                <div className="flex items-center gap-4 px-4 py-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(20,184,166,0.2)", border: "1px solid rgba(20,184,166,0.35)" }}>
                    <Zap className="w-6 h-6 text-teal-300 fill-teal-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-teal-400 mb-0.5">Clan Points</p>
                    <p className="font-black text-3xl text-teal-300 leading-none"
                      style={{ fontVariantNumeric: "tabular-nums" }}>{cs.clan_points.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50/70 dark:bg-amber-400/5 border border-amber-200/60 dark:border-amber-400/15 p-3 sm:p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> Clan Tournaments
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { v: cs.tournaments_won,    l: "Won",       e: "🏆" },
                    { v: cs.runner_up,           l: "Runner-Up", e: "🥈" },
                    { v: cs.tournaments_played, l: "Entered",   e: "🎯" },
                  ].map(({ v, l, e }) => (
                    <div key={l}>
                      <p className="font-black text-xl sm:text-2xl text-slate-700 dark:text-slate-200"
                        style={{ fontVariantNumeric: "tabular-nums" }}>{v}</p>
                      <p className="text-xs text-slate-500">{e} {l}</p>
                    </div>
                  ))}
                </div>
              </div>
              {(cs.singles_played + cs.doubles_played) > 0 && (
                <>
                  <WinLossBar won={cs.singles_won + cs.doubles_won} played={cs.singles_played + cs.doubles_played} />
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Singles", played: cs.singles_played, won: cs.singles_won,
                        icon: <User className="w-3.5 h-3.5" />, accent: "#0EA5E9",
                        iconBg: "bg-sky-100 dark:bg-sky-500/15", iconColor: "text-sky-600 dark:text-sky-400" },
                      { label: "Doubles", played: cs.doubles_played, won: cs.doubles_won,
                        icon: <Users className="w-3.5 h-3.5" />, accent: "#14B8A6",
                        iconBg: "bg-teal-100 dark:bg-teal-500/15", iconColor: "text-teal-600 dark:text-teal-400" },
                    ].map(({ label, played, won, icon, accent, iconBg, iconColor }) => (
                      <div key={label} className="rounded-2xl border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] p-4 flex flex-col items-center gap-3">
                        <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${iconColor}`}>
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</span>
                          {label}
                        </div>
                        <DonutRing won={won} played={played} accent={accent} />
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                          style={{ fontVariantNumeric: "tabular-nums" }}>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{won}W</span>
                          <span>·</span>
                          <span className="font-semibold text-rose-500 dark:text-rose-400">{played - won}L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(cs.series_singles_played + cs.series_doubles_played) > 0 && (
                <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-400/5 border border-emerald-200/60 dark:border-emerald-400/15 p-3 sm:p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Series Matches
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Singles", won: cs.series_singles_won, played: cs.series_singles_played, accent: "#22C55E" },
                      { label: "Doubles", won: cs.series_doubles_won, played: cs.series_doubles_played, accent: "#14B8A6" },
                    ].map(({ label, won, played, accent }) => {
                      const pct = wr(won, played);
                      return (
                        <div key={label} className="space-y-1.5">
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</span>
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200"
                              style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/8 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent, transition: "width 0.9s ease" }} />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                            <span>{won}W</span><span>{played}P</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400 py-6">No clan stats available</p>
          )}
        </div>
      </div>

      {/* Player Insights */}
      {(userData.mostWinsAgainst?.length > 0 || userData.mostLossesAgainst?.length > 0) && (
        <div className="sport-card overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-rose-400" />
          <div className="p-4 sm:p-5 pb-3">
            <h2 className="section-heading mb-4">Player Insights</h2>
          </div>
          <div className="flex divide-x divide-slate-100 dark:divide-white/6">
            {userData.mostWinsAgainst?.length > 0 && (
              <div className="flex-1 px-4 pb-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Dominates</p>
                </div>
                {userData.mostWinsAgainst.map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{p.name}</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                      style={{ fontVariantNumeric: "tabular-nums" }}>{p.wins}W</span>
                  </div>
                ))}
              </div>
            )}
            {userData.mostLossesAgainst?.length > 0 && (
              <div className="flex-1 px-4 pb-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-400 rotate-180" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">Nemesis</p>
                </div>
                {userData.mostLossesAgainst.map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center text-xs font-bold text-rose-700 dark:text-rose-400 flex-shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{p.name}</span>
                    <span className="text-xs font-black text-rose-500 dark:text-rose-400 flex-shrink-0"
                      style={{ fontVariantNumeric: "tabular-nums" }}>{p.losses}L</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [userData,            setUserData]            = useState<UserData | null>(null);
  const [coachData,           setCoachData]           = useState<CoachData | null>(null);
  const [isLoading,           setIsLoading]           = useState(true);
  const [selectedClan,        setSelectedClan]        = useState<string | null>(null);
  const [isLoadingClanStats,  setIsLoadingClanStats]  = useState(false);
  const [globalTournaments,   setGlobalTournaments]   = useState({ played: 0, won: 0, runner_up: 0 });
  const [view,                setView]                = useState<"coach" | "player">("coach");

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) { setIsLoading(false); return; }

        const [playerRes, coachRes] = await Promise.all([
          fetchWithAuth("/api/dashboard/all"),
          fetchWithAuth("/api/organisations/coach-dashboard"),
        ]);

        const playerData = await playerRes.json();
        const coachJson  = await coachRes.json();

        setUserData(playerData);
        setGlobalTournaments(playerData.globalTournaments ?? { played: 0, won: 0, runner_up: 0 });
        if (playerData.clans?.length > 0) setSelectedClan(playerData.clans[0].clan_id);

        if (coachJson.academies?.length > 0) {
          setCoachData(coachJson);
          setView("coach");
        } else {
          setView("player");
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, []);

  const fetchClanStats = async (clanId: string) => {
    setIsLoadingClanStats(true);
    try {
      const res  = await fetchWithAuth(`/api/dashboard/clanStats?clanId=${clanId}`);
      const data = await res.json();
      setUserData(prev => prev ? { ...prev, activeClanStats: data } : null);
    } catch (e) { console.error(e); }
    finally { setIsLoadingClanStats(false); }
  };

  useEffect(() => {
    if (!selectedClan || !userData || isLoading) return;
    if (!userData.activeClanStats || userData.activeClanStats.clan_id !== selectedClan) {
      fetchClanStats(selectedClan);
    }
  }, [selectedClan, isLoading]);

  if (isLoading) return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      </div>
    </div>
  );

  if (!userData) return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center p-6 sport-card max-w-sm">
        <p className="text-rose-400 font-semibold mb-1">Could not load profile</p>
        <p className="text-sm text-slate-500">Please try again later.</p>
      </div>
    </div>
  );

  const isCoach = coachData && coachData.academies.length > 0;

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto pb-10 animate-fade-up">

        {/* View toggle — only shown when user is both a coach and a player */}
        {isCoach && (
          <div className="flex gap-1 p-1 mb-4 rounded-xl w-fit"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["coach", "player"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  view === v
                    ? v === "coach"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}>
                {v === "coach" ? "Coach View" : "My Stats"}
              </button>
            ))}
          </div>
        )}

        {isCoach && view === "coach"
          ? <CoachDashboard data={coachData!} userName={userData.name} />
          : <PlayerDashboard
              userData={userData}
              globalTournaments={globalTournaments}
              selectedClan={selectedClan}
              setSelectedClan={(id) => setSelectedClan(id)}
              isLoadingClanStats={isLoadingClanStats}
            />
        }
      </div>
    </ProtectedRoute>
  );
};

export default Dashboard;
