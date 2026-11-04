"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import RatingLeaderboard from "@/app/components/RatingLeaderboard";

function LeaderboardWithParams() {
  const router = useRouter();
  const id = useSearchParams().get("clanId");

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-5 animate-fade-up">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/clan/clandetails?clanId=${id}`)}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl tracking-wide text-slate-800 dark:text-white">Leaderboard</h1>
          <p className="text-xs text-slate-400">Ranked by rating · provisional players listed last</p>
        </div>
      </div>

      {id
        ? <RatingLeaderboard clanId={id} />
        : <p className="text-sm text-slate-400">No clan selected.</p>}
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
