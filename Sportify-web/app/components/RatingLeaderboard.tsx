"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Search, Crown, Medal, User, Users2, Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { RatingValue } from "@/app/components/RatingDelta";

// Rows from GET /api/clans/leaderboard?clanId=&format=singles|doubles.
// The API ranks them: rated players by rating, then provisional players.
export type LeaderboardRow = {
  user_id: string;
  name: string;
  rank: number;
  rating: number;
  provisional: boolean;
  singles_rating: number;
  singles_provisional: boolean;
  singles_rated_matches: number;
  doubles_rating: number;
  doubles_provisional: boolean;
  doubles_rated_matches: number;
  singles_played: number;
  singles_won: number | string | null;
  doubles_played: number;
  doubles_won: number | string | null;
};

type Format = "singles" | "doubles";

const num = (v: unknown) => Number(v ?? 0) || 0;

function WinRateBar({ won, played }: { won: number; played: number }) {
  const rate = played > 0 ? (won / played) * 100 : 0;
  const color =
    rate >= 70 ? "from-emerald-400 to-teal-500"
    : rate >= 50 ? "from-blue-400 to-teal-500"
    : "from-rose-400 to-pink-500";
  return (
    <div className="flex items-center gap-2 w-[72px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right flex-shrink-0 tabular-nums ${
        rate >= 70 ? "text-emerald-500 dark:text-emerald-400"
        : rate >= 50 ? "text-blue-500 dark:text-blue-400"
        : "text-rose-500 dark:text-rose-400"
      }`}>{Math.round(rate)}%</span>
    </div>
  );
}

function RankBadge({ rank, provisional }: { rank: number; provisional: boolean }) {
  if (!provisional && rank === 1) return (
    <div className="w-7 h-7 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm flex-shrink-0">
      <Crown className="w-3.5 h-3.5 text-white" />
    </div>
  );
  if (!provisional && (rank === 2 || rank === 3)) return (
    <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${rank === 2 ? "bg-slate-400 dark:bg-slate-500" : "bg-amber-700"}`}>
      <Medal className="w-3.5 h-3.5 text-white" />
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-white/8 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">{provisional ? "–" : rank}</span>
    </div>
  );
}

function Podium({ players }: { players: LeaderboardRow[] }) {
  const [p1, p2, p3] = players;
  const Card = ({ p, rank, height }: { p: LeaderboardRow; rank: 1 | 2 | 3; height: string }) => {
    const isFirst = rank === 1;
    return (
      <div className={`flex flex-col items-center ${height}`}>
        <div className={`w-full flex flex-col items-center justify-end h-full rounded-2xl border px-2 py-3 gap-1.5
          ${isFirst
            ? "bg-amber-50 dark:bg-amber-400/8 border-amber-300/50 dark:border-amber-400/25"
            : "bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/6"}`}>
          {isFirst && (
            <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          {rank === 2 && <Medal className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
          {rank === 3 && <Medal className="w-4 h-4 text-amber-700" />}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0
            ${isFirst ? "bg-gradient-to-br from-amber-400 to-orange-500"
              : rank === 2 ? "bg-gradient-to-br from-slate-400 to-slate-500"
              : "bg-gradient-to-br from-amber-700 to-amber-800"}`}>
            {p.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-xs font-bold text-slate-800 dark:text-white text-center truncate w-full leading-tight">{p.name.split(" ")[0]}</p>
          <p className={`text-base font-black leading-none tabular-nums ${isFirst ? "text-amber-500 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
            {Math.round(p.rating)}
          </p>
        </div>
      </div>
    );
  };
  return (
    <div className="grid grid-cols-3 gap-2 items-end" style={{ height: "180px" }}>
      {p2 ? <Card p={p2} rank={2} height="h-[140px]" /> : <div />}
      {p1 ? <Card p={p1} rank={1} height="h-full" /> : <div />}
      {p3 ? <Card p={p3} rank={3} height="h-[120px]" /> : <div />}
    </div>
  );
}

/** Clan / batch leaderboard ranked by Glicko-2 rating, singles or doubles. */
export default function RatingLeaderboard({ clanId }: { clanId: string }) {
  const router = useRouter();
  const [format, setFormat] = useState<Format>("singles");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWithAuth(`/api/clans/leaderboard?clanId=${encodeURIComponent(clanId)}&format=${format}`)
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || "Couldn't load the leaderboard");
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch(e => { if (!cancelled) { setRows([]); setError(e instanceof Error ? e.message : "Couldn't load the leaderboard"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clanId, format]);

  const filtered = rows.filter(p => (p.name ?? "").toLowerCase().includes(query.toLowerCase()));
  const rated = rows.filter(p => !p.provisional);
  const showPodium = !loading && !query && rated.length >= 3;

  const TABS: { id: Format; label: string; icon: React.ReactNode }[] = [
    { id: "singles", label: "Singles", icon: <User className="w-3.5 h-3.5" /> },
    { id: "doubles", label: "Doubles", icon: <Users2 className="w-3.5 h-3.5" /> },
  ];
  const cols = "28px 1fr 76px 48px 72px";

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setFormat(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              format === t.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-white/6 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {showPodium && <Podium players={rated} />}

      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-amber-400 to-blue-500" />
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl px-3 py-2.5 mb-4">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input type="text" placeholder="Search players…" value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder-slate-400 focus:outline-none" />
            {query && (
              <button onClick={() => setQuery("")} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1">Clear</button>
            )}
          </div>

          <div className="grid items-center gap-x-2 px-2 pb-2 border-b border-slate-100 dark:border-white/6 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns: cols }}>
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Rating</span>
            <span className="text-right">W/L</span>
            <span className="text-right">Win rate</span>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 text-blue-400 animate-spin" /></div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-rose-400">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Trophy className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No players found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-white/4">
              {filtered.map((p, i) => {
                const played = format === "singles" ? num(p.singles_played) : num(p.doubles_played);
                const won = format === "singles" ? num(p.singles_won) : num(p.doubles_won);
                const firstProvisional = p.provisional && (i === 0 || !filtered[i - 1].provisional);
                return (
                  <div key={p.user_id}>
                    {firstProvisional && (
                      <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Provisional · not enough rated matches yet
                      </p>
                    )}
                    <div onClick={() => router.push(`/clan/player/${p.user_id}?clanId=${clanId}`)}
                      className={`grid items-center gap-x-2 py-2.5 px-2 rounded-xl transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-white/4 ${!p.provisional && p.rank === 1 ? "bg-amber-50/50 dark:bg-amber-400/5" : ""}`}
                      style={{ gridTemplateColumns: cols }}>
                      <RankBadge rank={p.rank} provisional={p.provisional} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{played} {format}</p>
                      </div>
                      <span className="text-right text-sm text-slate-700 dark:text-slate-200">
                        <RatingValue rating={p.rating} provisional={p.provisional} />
                      </span>
                      <span className="text-right text-xs tabular-nums whitespace-nowrap">
                        <span className="text-emerald-500 font-semibold">{won}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-rose-400 font-semibold">{Math.max(played - won, 0)}</span>
                      </span>
                      <div className="flex justify-end"><WinRateBar won={won} played={played} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-slate-400">{filtered.length} player{filtered.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}
