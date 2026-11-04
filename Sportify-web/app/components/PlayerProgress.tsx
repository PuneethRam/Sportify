"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Flame, Loader2, Shield, User, Users2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import ShareCardButton from "@/app/components/ShareCardButton";
import { RatingValue } from "@/app/components/RatingDelta";
import { BadgeChip } from "@/app/components/SeasonStanding";

// GET /api/players/progress?userId=
type PublicRating = { rating: number; rd: number; matches: number; provisional: boolean };
type ClanProgress = {
  clanId: number; name: string; type: string | null;
  ratingRank: number; members: number;
  seasonRank: number | null; seasonPoints: number | null; seasonPlayers: number;
};
type ProgressBadge = {
  clanId: number; clanName: string | null; season: string; seasonName: string;
  badge: string; label: string; rank: number | null; value: number | null;
};
type Progress = {
  userId: string; name: string;
  ratings: { singles: PublicRating; doubles: PublicRating };
  format: "singles" | "doubles";
  streak: { current: number; best: number; playedThisWeek: boolean };
  badges: ProgressBadge[];
  clans: ClanProgress[];
  season: string;
};

/**
 * Weekly streak, singles / doubles rating, rank in each clan and season
 * badges for a player. Shows a share button on your own profile.
 */
export default function PlayerProgress({ userId, clanId }: { userId?: string; clanId?: string | null }) {
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWithAuth(`/api/players/progress${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`)
      .then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "Couldn't load progress");
        if (!cancelled) setData(d);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load progress"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return (
    <div className="sport-card p-6 flex justify-center"><Loader2 className="w-5 h-5 text-sky-400 animate-spin" /></div>
  );
  if (error || !data) return (
    <div className="sport-card p-4 text-sm text-slate-400">{error ?? "Progress unavailable"}</div>
  );

  const isMe = auth.currentUser?.uid === data.userId;
  const { streak } = data;
  const formatLabel = data.format === "doubles" ? "doubles" : "singles";

  return (
    <div className="sport-card overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-orange-400 via-amber-400 to-sky-500" />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Progress</p>
          {isMe && <ShareCardButton payload={{ kind: "profile", clanId: clanId ?? null }} label="Share my rank" />}
        </div>

        {/* Weekly streak */}
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${streak.current > 0 ? "bg-orange-100 dark:bg-orange-500/15" : "bg-slate-100 dark:bg-white/6"}`}>
            <Flame className={`w-5 h-5 ${streak.current > 0 ? "text-orange-500" : "text-slate-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Weekly streak</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">{streak.current}</span>
              <span className="text-xs text-slate-400">week{streak.current !== 1 ? "s" : ""} now</span>
              <span className="text-2xl font-black text-orange-500 tabular-nums ml-2">{streak.best}</span>
              <span className="text-xs text-slate-400">best</span>
            </div>
            {streak.current > 0 && !streak.playedThisWeek && (
              <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1">
                <CalendarCheck className="w-3.5 h-3.5" /> Play a ranked match by Sunday to keep it going
              </p>
            )}
          </div>
        </div>

        {/* Ratings */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "singles" as const, label: "Singles", icon: <User className="w-3.5 h-3.5" />, color: "text-sky-600 dark:text-sky-400" },
            { key: "doubles" as const, label: "Doubles", icon: <Users2 className="w-3.5 h-3.5" />, color: "text-violet-600 dark:text-violet-400" },
          ]).map(({ key, label, icon, color }) => {
            const r = data.ratings[key];
            return (
              <div key={key} className="rounded-xl border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] p-3">
                <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${color}`}>{icon}{label}</p>
                <div className="mt-1.5 text-2xl text-slate-800 dark:text-white leading-none">
                  <RatingValue rating={r.rating} provisional={r.provisional} className={r.provisional ? "text-xs" : ""} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{r.matches} rated match{r.matches !== 1 ? "es" : ""}</p>
              </div>
            );
          })}
        </div>

        {/* Rank in each clan */}
        {data.clans.length > 0 && (
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Rank by {formatLabel} rating</p>
            <div className="space-y-1.5">
              {data.clans.map(c => (
                <Link key={c.clanId} href={`/clan/leaderboard?clanId=${c.clanId}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-100 dark:border-white/6 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors no-underline">
                  <Shield className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                    {data.ratings[data.format].provisional
                      ? "Provisional"
                      : <><span className="font-black text-slate-700 dark:text-white">#{c.ratingRank}</span> of {c.members}</>}
                    {c.seasonRank != null && <> · season #{c.seasonRank}</>}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Season badges</p>
          {data.badges.length === 0 ? (
            <p className="text-xs text-slate-400">No badges yet. They&apos;re awarded at the end of each monthly season.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.badges.map(b => (
                <span key={`${b.clanId}-${b.season}-${b.badge}`} title={`${b.clanName ?? "Clan"} · ${b.seasonName}`}>
                  <BadgeChip badge={b.badge} label={b.label}
                    suffix={`${b.seasonName.split(" ")[0].slice(0, 3)} ${b.season.slice(0, 4)}${b.clanName ? ` · ${b.clanName}` : ""}`} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
