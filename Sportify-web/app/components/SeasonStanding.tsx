"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, CalendarRange, Crown, Loader2, Medal, Trophy } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

// GET /api/clans/season?clanId=&season=YYYY-MM
type SeasonRow = { userId: string; name: string; rank: number; points: number; played: number; won: number; lost: number };
type SeasonBadge = { userId: string; name: string; badge: string; label: string; rank: number | null; value: number | null };
type SeasonData = { season: string; seasonName: string; current: boolean; standings: SeasonRow[]; badges: SeasonBadge[] };

/** How many months back the selector offers. */
const MONTHS_BACK = 12;

function previousSeason(season: string) {
  const [y, m] = season.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function monthLabel(season: string) {
  const [y, m] = season.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const BADGE_STYLE: Record<string, string> = {
  champion: "bg-amber-100 text-amber-700 border-amber-300/60 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/25",
  top3: "bg-slate-100 text-slate-600 border-slate-300/60 dark:bg-white/8 dark:text-slate-200 dark:border-white/15",
  most_matches: "bg-blue-100 text-blue-700 border-blue-300/60 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/25",
  biggest_gain: "bg-emerald-100 text-emerald-700 border-emerald-300/60 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/25",
};

export function BadgeChip({ badge, label, suffix }: { badge: string; label: string; suffix?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${BADGE_STYLE[badge] ?? BADGE_STYLE.top3}`}>
      {badge === "champion" ? <Crown className="w-3 h-3" /> : <Award className="w-3 h-3" />}
      {label}{suffix ? ` · ${suffix}` : ""}
    </span>
  );
}

/** A clan's / batch's monthly season: standings and, once it's over, badges. */
export default function SeasonStanding({ clanId }: { clanId: string }) {
  const router = useRouter();
  const [season, setSeason] = useState<string | null>(null); // null = this month
  const [currentSeason, setCurrentSeason] = useState<string | null>(null);
  const [data, setData] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = `clanId=${encodeURIComponent(clanId)}${season ? `&season=${season}` : ""}`;
    fetchWithAuth(`/api/clans/season?${qs}`)
      .then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "Couldn't load the season");
        if (cancelled) return;
        setData(d);
        if (d.current) setCurrentSeason(d.season);
      })
      .catch(e => { if (!cancelled) { setData(null); setError(e instanceof Error ? e.message : "Couldn't load the season"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clanId, season]);

  const options: string[] = [];
  if (currentSeason) {
    let s = currentSeason;
    for (let i = 0; i <= MONTHS_BACK; i++) { options.push(s); s = previousSeason(s); }
  }

  const badgesFor = (uid: string) => (data?.badges ?? []).filter(b => b.userId === uid);

  return (
    <div className="space-y-4">
      <div className="sport-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <CalendarRange className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 dark:text-white truncate">
              {data?.seasonName ?? (season ? monthLabel(season) : "This month")} season
            </p>
            <p className="text-xs text-slate-400">
              {data?.current ? "In progress · badges are awarded when the month ends" : "Final standings"}
            </p>
          </div>
        </div>
        {options.length > 0 && (
          <select value={season ?? currentSeason ?? ""} aria-label="Season"
            onChange={e => setSeason(e.target.value === currentSeason ? null : e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-400">
            {options.map(o => <option key={o} value={o}>{monthLabel(o)}{o === currentSeason ? " (current)" : ""}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-400/5 border border-rose-400/20 text-rose-400 text-sm">{error}</div>
      ) : !data || data.standings.length === 0 ? (
        <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
          <Trophy className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {data?.current ? "No matches this month yet. Play a match to get on the board." : "No matches were played this month."}
          </p>
        </div>
      ) : (
        <>
          {data.badges.length > 0 && (
            <div className="sport-card p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Badges</p>
              <div className="space-y-2">
                {data.badges.map(b => (
                  <div key={`${b.userId}-${b.badge}`} className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{b.name}</span>
                    <BadgeChip badge={b.badge} label={b.label} suffix={b.badge === "top3" && b.rank ? `#${b.rank}` : undefined} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sport-card overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="p-3 sm:p-4">
              <div className="grid items-center gap-x-2 px-2 pb-2 border-b border-slate-100 dark:border-white/6 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                style={{ gridTemplateColumns: "28px 1fr 56px 52px" }}>
                <span>#</span><span>Player</span><span className="text-right">Pts</span><span className="text-right">W/L</span>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-white/4">
                {data.standings.map(s => (
                  <div key={s.userId} onClick={() => router.push(`/clan/player/${s.userId}?clanId=${clanId}`)}
                    className={`grid items-center gap-x-2 py-2.5 px-2 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/4 transition-colors ${s.rank === 1 ? "bg-amber-50/50 dark:bg-amber-400/5" : ""}`}
                    style={{ gridTemplateColumns: "28px 1fr 56px 52px" }}>
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      s.rank === 1 ? "bg-amber-400" : s.rank === 2 ? "bg-slate-400 dark:bg-slate-500" : s.rank === 3 ? "bg-amber-700" : "bg-slate-100 dark:bg-white/8"}`}>
                      {s.rank === 1 ? <Crown className="w-3.5 h-3.5 text-white" />
                        : s.rank <= 3 ? <Medal className="w-3.5 h-3.5 text-white" />
                        : <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">{s.rank}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.name}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className="text-xs text-slate-400">{s.played} played</span>
                        {badgesFor(s.userId).map(b => <BadgeChip key={b.badge} badge={b.badge} label={b.label} />)}
                      </div>
                    </div>
                    <span className="text-right text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">{Number(s.points).toFixed(1)}</span>
                    <span className="text-right text-xs tabular-nums whitespace-nowrap">
                      <span className="text-emerald-500 font-semibold">{s.won}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-rose-400 font-semibold">{s.lost}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
