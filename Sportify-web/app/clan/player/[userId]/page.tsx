"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, User, Users2, Loader2, TrendingUp, Flame, Zap } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

// ── Types ────────────────────────────────────────────────────────────────────

type RecentMatch = {
  match_id: number;
  match_type: "singles" | "doubles";
  match_date: string;
  opponent_name?: string;
  partner_name?: string;
  score_details: unknown;
  result: "win" | "loss" | "draw";
};

type Profile = {
  user_id: string;
  name: string;
  email: string;
  global_pts: number;
  clans: { clan_id: number; name: string; clan_points: number }[];
  stats: { singles_played: number; singles_won: number; doubles_played: number; doubles_won: number };
  currentStreak: number;
  bestStreak: number;
  mostWinsAgainst:   { opponent_id: string; name: string; wins: number }[];
  mostLossesAgainst: { opponent_id: string; name: string; losses: number }[];
  recentMatches: RecentMatch[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseScore(raw: unknown): string {
  if (!raw) return "–";
  if (typeof raw === "object") return (raw as { score?: string }).score ?? "–";
  try { const p = JSON.parse(raw as string); return p.score ?? (raw as string); }
  catch { return raw as string; }
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DonutRing({ won, played, accent }: { won: number; played: number; accent: string }) {
  const pct = played > 0 ? Math.min(100, Math.round((won / played) * 100)) : 0;
  const track = "#334155";
  return (
    <div className="relative w-[72px] h-[72px] flex-shrink-0">
      <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
        <circle cx="36" cy="36" r="28" fill="none" stroke={track} strokeWidth="8" />
        <circle cx="36" cy="36" r="28" fill="none" stroke={accent}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 28}`}
          strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black text-slate-800 dark:text-white leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
    </div>
  );
}

function MatchRow({ m }: { m: RecentMatch }) {
  const isWin  = m.result === "win";
  const isLoss = m.result === "loss";
  const accent = isWin ? "#22C55E" : isLoss ? "#F43F5E" : "#64748B";
  const score  = parseScore(m.score_details);

  const label = m.match_type === "singles"
    ? `vs ${m.opponent_name ?? "Unknown"}`
    : `w/ ${m.partner_name ?? "Partner"} (Doubles)`;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
      style={{ borderLeft: `3px solid ${accent}` }}>
      {/* Type icon */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
        ${m.match_type === "singles"
          ? "bg-sky-100 dark:bg-sky-500/15"
          : "bg-violet-100 dark:bg-violet-500/15"}`}>
        {m.match_type === "singles"
          ? <User className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          : <Users2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5 font-mono">{score} · {relativeDate(m.match_date)}</p>
      </div>

      {/* Result chip */}
      <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg flex-shrink-0"
        style={{ background: `${accent}18`, color: accent }}>
        {m.result}
      </span>
    </div>
  );
}

// ── Main content ─────────────────────────────────────────────────────────────

function PlayerProfileContent() {
  const params       = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const clanId       = searchParams.get("clanId");
  const userId       = params.userId;

  const [profile,   setProfile]   = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setError("No user ID"); setIsLoading(false); return; }
    (async () => {
      try {
        const res  = await fetchWithAuth(`/api/dashboard/userProfile?userId=${userId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setProfile(data);
      } catch (e) { setError((e as Error).message || "Failed to load"); }
      finally { setIsLoading(false); }
    })();
  }, [userId]);

  if (isLoading) return (
    <div className="flex flex-col items-center py-28 gap-3">
      <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading profile…</p>
    </div>
  );

  if (error || !profile) return (
    <div className="m-4 p-5 rounded-2xl bg-rose-50 dark:bg-rose-500/8 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm text-center">
      {error ?? "Profile not found"}
    </div>
  );

  const { stats } = profile;
  const totalPlayed = stats.singles_played + stats.doubles_played;
  const totalWon    = stats.singles_won    + stats.doubles_won;
  const totalLost   = totalPlayed - totalWon;
  const overallPct  = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0;

  const clanName = clanId
    ? (profile.clans.find(c => String(c.clan_id) === clanId)?.name ?? profile.clans[0]?.name)
    : profile.clans[0]?.name;

  const winBar = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto pb-12 animate-fade-up">

      {/* ── Back ── */}
      <div className="px-4 pt-4 pb-2">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 -ml-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* ── Hero ── (always dark) */}
      <div className="mx-3 rounded-3xl overflow-hidden shadow-xl"
        style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 60%, #0E7490 100%)" }}>

        {/* Top pattern strip */}
        <div className="relative px-5 pt-6 pb-0">
          {/* Subtle court-line geometry */}
          <svg className="absolute top-0 right-0 opacity-[0.07]" width="180" height="120" viewBox="0 0 180 120">
            <circle cx="150" cy="20" r="60" fill="none" stroke="white" strokeWidth="1"/>
            <circle cx="150" cy="20" r="40" fill="none" stroke="white" strokeWidth="1"/>
            <line x1="0" y1="60" x2="180" y2="60" stroke="white" strokeWidth="0.8"/>
          </svg>

          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black text-4xl"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.18)" }}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="font-black text-white leading-none mb-1.5 truncate"
                style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: "-0.02em" }}>
                {profile.name}
              </h1>
              <p className="text-sky-300 text-xs truncate mb-2">{profile.email}</p>
              {clanName && (
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {clanName}
                </span>
              )}
            </div>
          </div>

          {/* Key stats bar */}
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4 pb-5">
            {[
              { label: "Matches", value: totalPlayed },
              { label: "Win rate", value: `${overallPct}%` },
              { label: "Streak", value: profile.currentStreak > 0 ? `${profile.currentStreak} 🔥` : profile.currentStreak },
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

      {/* ── W/L split bar ── */}
      {totalPlayed > 0 && (
        <div className="mx-3 mt-3 rounded-2xl border border-slate-100 dark:border-white/6 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="flex">
            <div className="flex items-center gap-1.5 px-3 py-2.5"
              style={{ width: `${Math.max(winBar, 8)}%`, background: "rgba(34,197,94,0.08)" }}>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400" style={{ fontVariantNumeric: "tabular-nums" }}>{totalWon}W</span>
            </div>
            <div className="flex items-center justify-end gap-1.5 px-3 py-2.5 flex-1"
              style={{ background: "rgba(244,63,94,0.06)" }}>
              <span className="text-sm font-black text-rose-500 dark:text-rose-400" style={{ fontVariantNumeric: "tabular-nums" }}>{totalLost}L</span>
            </div>
          </div>
          <div className="h-1.5 flex">
            <div style={{ width: `${winBar}%`, background: "#22C55E", transition: "width 0.9s ease" }} />
            <div style={{ flex: 1, background: "#F43F5E", opacity: 0.7 }} />
          </div>
        </div>
      )}

      {/* ── Singles / Doubles breakdown ── */}
      <div className="mx-3 mt-3 grid grid-cols-2 gap-3">
        {[
          { label: "Singles", played: stats.singles_played, won: stats.singles_won, icon: <User className="w-3.5 h-3.5" />, accent: "#0EA5E9", iconBg: "bg-sky-100 dark:bg-sky-500/15", iconColor: "text-sky-600 dark:text-sky-400" },
          { label: "Doubles", played: stats.doubles_played, won: stats.doubles_won, icon: <Users2 className="w-3.5 h-3.5" />, accent: "#A855F7", iconBg: "bg-violet-100 dark:bg-violet-500/15", iconColor: "text-violet-600 dark:text-violet-400" },
        ].map(({ label, played, won, icon, accent, iconBg, iconColor }) => (
          <div key={label} className="sport-card p-4 flex flex-col items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${iconColor}`}>
              <span className={`w-5 h-5 rounded-md flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</span>
              {label}
            </div>
            <DonutRing won={won} played={played} accent={accent} />
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{won}W</span>
              <span>·</span>
              <span className="font-semibold text-rose-500 dark:text-rose-400">{played - won}L</span>
              <span>·</span>
              <span>{played}P</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Streak card ── */}
      {profile.bestStreak > 1 && (
        <div className="mx-3 mt-3 sport-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Win streaks</p>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-black text-slate-800 dark:text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                {profile.currentStreak}
              </span>
              <span className="text-xs text-slate-400">current</span>
              <span className="text-2xl font-black text-orange-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                {profile.bestStreak}
              </span>
              <span className="text-xs text-slate-400">best ever</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Rivals ── */}
      {(profile.mostWinsAgainst.length > 0 || profile.mostLossesAgainst.length > 0) && (
        <div className="mx-3 mt-3 sport-card overflow-hidden">
          <div className="flex divide-x divide-slate-100 dark:divide-white/6">
            {profile.mostWinsAgainst.length > 0 && (
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Dominates</p>
                </div>
                {profile.mostWinsAgainst.map(r => (
                  <div key={r.opponent_id} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">{r.wins}–0</span>
                  </div>
                ))}
              </div>
            )}
            {profile.mostLossesAgainst.length > 0 && (
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-400 rotate-180" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400">Nemesis</p>
                </div>
                {profile.mostLossesAgainst.map(r => (
                  <div key={r.opponent_id} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                    <span className="text-xs font-black text-rose-500 dark:text-rose-400 flex-shrink-0">0–{r.losses}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent matches ── */}
      {profile.recentMatches.length > 0 && (
        <div className="mx-3 mt-3 sport-card overflow-hidden">
          <div className="px-4 pt-4 pb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recent matches</p>
            <span className="text-[11px] text-slate-400">{profile.recentMatches.length} shown</span>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
            {profile.recentMatches.map(m => <MatchRow key={`${m.match_type}-${m.match_id}`} m={m} />)}
          </div>
        </div>
      )}

      {totalPlayed === 0 && (
        <div className="mx-3 mt-3 rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
          <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No matches yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Stats will appear after the first match</p>
        </div>
      )}
    </div>
  );
}

export default function PlayerProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-28 gap-3">
        <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <PlayerProfileContent />
    </Suspense>
  );
}
