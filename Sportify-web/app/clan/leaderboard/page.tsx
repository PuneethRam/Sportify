"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trophy, Search, ArrowLeft, Crown, Medal, User, Users2, Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

// ── Types ────────────────────────────────────────────────────────────────────

type Player = {
  user_id: string;
  name: string;
  clan_points:    number;
  singles_points: number;
  doubles_points: number;
  matchesplayed:  number;
  matcheswon:     number;
  matcheslost:    number;
  singles_played: number;
  singles_won:    number;
  doubles_played: number;
  doubles_won:    number;
};

type Tab = "overall" | "singles" | "doubles";

// ── Sub-components ────────────────────────────────────────────────────────────

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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-7 h-7 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm flex-shrink-0">
      <Crown className="w-3.5 h-3.5 text-white" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-7 h-7 rounded-xl bg-slate-400 dark:bg-slate-500 flex items-center justify-center flex-shrink-0">
      <Medal className="w-3.5 h-3.5 text-white" />
    </div>
  );
  if (rank === 3) return (
    <div className="w-7 h-7 rounded-xl bg-amber-700 flex items-center justify-center flex-shrink-0">
      <Medal className="w-3.5 h-3.5 text-white" />
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-white/8 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400" style={{ fontVariantNumeric: "tabular-nums" }}>{rank}</span>
    </div>
  );
}

// ── Podium ────────────────────────────────────────────────────────────────────

function Podium({ players, tab }: { players: Player[]; tab: Tab }) {
  const getPoints = (p: Player) =>
    tab === "singles" ? (p.singles_points ?? 0) :
    tab === "doubles" ? (p.doubles_points ?? 0) :
    (p.clan_points ?? 0);

  const p1 = players[0], p2 = players[1], p3 = players[2];

  const Card = ({ p, rank, height }: { p: Player; rank: 1 | 2 | 3; height: string }) => {
    const pts = getPoints(p);
    const isFirst = rank === 1;
    return (
      <div className={`flex flex-col items-center ${height}`}>
        <div className={`w-full flex flex-col items-center justify-end h-full rounded-2xl border px-2 py-3 gap-1.5
          ${isFirst
            ? "bg-amber-50 dark:bg-amber-400/8 border-amber-300/50 dark:border-amber-400/25"
            : "bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/6"}`}>
          {/* Crown chip */}
          {isFirst && (
            <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          {rank === 2 && <Medal className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
          {rank === 3 && <Medal className="w-4 h-4 text-amber-700" />}
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0
            ${isFirst
              ? "bg-gradient-to-br from-amber-400 to-orange-500"
              : rank === 2
              ? "bg-gradient-to-br from-slate-400 to-slate-500"
              : "bg-gradient-to-br from-amber-700 to-amber-800"}`}>
            {p.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-xs font-bold text-slate-800 dark:text-white text-center truncate w-full leading-tight">{p.name.split(" ")[0]}</p>
          <p className={`text-base font-black leading-none ${isFirst ? "text-amber-500 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}
            style={{ fontVariantNumeric: "tabular-nums" }}>{pts.toFixed(1)}</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

function LeaderboardWithParams() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const id           = searchParams.get("clanId");

  const [players,     setPlayers]     = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading,   setIsLoading]   = useState(true);
  const [activeTab,   setActiveTab]   = useState<Tab>("overall");

  useEffect(() => {
    if (!id) { setIsLoading(false); return; }
    (async () => {
      try {
        const res  = await fetchWithAuth(`/api/clans/leaderboard?clanId=${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPlayers(Array.isArray(data) ? data : []);
      } catch { setPlayers([]); }
      finally { setIsLoading(false); }
    })();
  }, [id]);

  const sorted = [...players].sort((a, b) => {
    if (activeTab === "singles") return ((b.singles_points ?? 0) - (a.singles_points ?? 0)) || (b.singles_won - a.singles_won);
    if (activeTab === "doubles") return ((b.doubles_points ?? 0) - (a.doubles_points ?? 0)) || (b.doubles_won - a.doubles_won);
    return (b.clan_points ?? 0) - (a.clan_points ?? 0);
  });
  const filtered = sorted.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overall", label: "Overall",  icon: <Trophy className="w-3.5 h-3.5" /> },
    { id: "singles", label: "Singles",  icon: <User className="w-3.5 h-3.5" /> },
    { id: "doubles", label: "Doubles",  icon: <Users2 className="w-3.5 h-3.5" /> },
  ];

  const showPodium = !isLoading && filtered.length >= 3 && !searchQuery;

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-5 animate-fade-up">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/clan/clandetails?clanId=${id}`)}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl tracking-wide text-slate-800 dark:text-white">Leaderboard</h1>
          <p className="text-xs text-slate-400">Clan rankings & statistics</p>
        </div>
      </div>

      {/* ── Tab selector ── */}
      <div className="flex gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === t.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-white/6 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Podium ── */}
      {showPodium && (
        <Podium players={filtered} tab={activeTab} />
      )}

      {/* ── Table ── */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-amber-400 to-blue-500" />
        <div className="p-3 sm:p-4">

          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl px-3 py-2.5 mb-4">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input type="text" placeholder="Search players…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder-slate-400 focus:outline-none" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1">Clear</button>
            )}
          </div>

          {/* Column headers */}
          <div className="grid items-center gap-x-2 px-2 pb-2 border-b border-slate-100 dark:border-white/6 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns: "28px 1fr 52px 48px 72px" }}>
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Pts</span>
            <span className="text-right">W/L</span>
            <span className="text-right">Win rate</span>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Trophy className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No players found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-white/4">
              {filtered.map((p, i) => {
                const rank  = i + 1;
                const won   = activeTab === "singles" ? p.singles_won    : activeTab === "doubles" ? p.doubles_won    : p.matcheswon;
                const played = activeTab === "singles" ? p.singles_played : activeTab === "doubles" ? p.doubles_played : p.matchesplayed;
                const lost  = played - won;
                const pts   = activeTab === "singles" ? (p.singles_points ?? 0) : activeTab === "doubles" ? (p.doubles_points ?? 0) : (p.clan_points ?? 0);

                return (
                  <div key={p.user_id}
                    onClick={() => router.push(`/clan/player/${p.user_id}?clanId=${id}`)}
                    className={`grid items-center gap-x-2 py-2.5 px-2 rounded-xl transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-white/4 ${rank === 1 ? "bg-amber-50/50 dark:bg-amber-400/5" : ""}`}
                    style={{ gridTemplateColumns: "28px 1fr 52px 48px 72px" }}>

                    <RankBadge rank={rank} />

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {activeTab === "overall"  ? `${p.matchesplayed} matches`  :
                         activeTab === "singles"  ? `${p.singles_played} singles` :
                                                    `${p.doubles_played} doubles`}
                      </p>
                    </div>

                    {/* Points */}
                    <span className="text-right text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                      {pts.toFixed(1)}
                    </span>

                    {/* W / L */}
                    <span className="text-right text-xs tabular-nums whitespace-nowrap">
                      <span className="text-emerald-500 font-semibold">{won}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-rose-400 font-semibold">{lost}</span>
                    </span>

                    {/* Win rate bar */}
                    <div className="flex justify-end">
                      <WinRateBar won={won} played={played} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-center text-xs text-slate-400">{filtered.length} player{filtered.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

const ClanLeaderboard = () => (
  <Suspense fallback={
    <div className="flex flex-col items-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  }>
    <LeaderboardWithParams />
  </Suspense>
);

export default ClanLeaderboard;
