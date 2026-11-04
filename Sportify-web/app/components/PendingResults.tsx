"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Hourglass, AlertTriangle } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { track } from "@/lib/track";

type Player = { id: string; name: string };
type Pending = {
  submissionId: number;
  matchType: "singles" | "doubles";
  status: "pending" | "disputed";
  submittedByName: string;
  score: string;
  team1Players: Player[];
  team2Players: Player[];
  winner: "team1" | "team2" | null;
  canConfirm: boolean;
};

/**
 * Match results waiting for the other side (or a clan admin) to confirm.
 * Results only reach the leaderboard once confirmed.
 */
export default function PendingResults({ clanId, onResolved }: { clanId: string; onResolved?: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/clans/matches/pending?clanId=${clanId}`);
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch { /* section stays hidden */ }
  }, [clanId]);

  useEffect(() => { load(); }, [load]);

  const act = async (submissionId: number, action: "confirm" | "reject") => {
    if (action === "reject" && !confirm("Dispute this result? A clan admin will need to resolve it.")) return;
    setBusy(submissionId);
    try {
      const res = await fetchWithAuth("/api/clans/matches/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, action }),
      });
      const data = await res.json();
      if (!data.success) alert(data.error || "Could not update this result");
      else track(action === "confirm" ? "match_confirmed" : "match_disputed");
      await load();
      if (data.success && action === "confirm") onResolved?.();
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return null;

  const names = (ps: Player[]) => ps.map(p => p.name).join(" & ");

  return (
    <div className="rounded-2xl border border-amber-300/40 dark:border-amber-400/20 bg-amber-50/60 dark:bg-amber-400/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300">
        <Hourglass className="w-4 h-4" /> Results awaiting confirmation
      </div>
      {items.map(it => (
        <div key={it.submissionId} className="flex flex-wrap items-center gap-3 justify-between rounded-xl bg-white dark:bg-[#0C0E21] border border-slate-200 dark:border-white/8 px-3 py-2.5">
          <div className="min-w-0 text-sm">
            <div className="text-slate-800 dark:text-slate-100">
              <span className={it.winner === "team1" ? "font-bold" : ""}>{names(it.team1Players)}</span>
              <span className="text-slate-400"> vs </span>
              <span className={it.winner === "team2" ? "font-bold" : ""}>{names(it.team2Players)}</span>
              <span className="ml-2 font-mono text-slate-500">{it.score}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              {it.status === "disputed"
                ? <><AlertTriangle className="w-3 h-3 text-rose-400" /> Disputed — needs a clan admin</>
                : it.canConfirm
                ? <>Submitted by {it.submittedByName} · awaiting your confirmation</>
                : <>Submitted by {it.submittedByName} · awaiting opponent</>}
            </div>
          </div>
          {it.canConfirm && (
            <div className="flex gap-2">
              <button disabled={busy === it.submissionId} onClick={() => act(it.submissionId, "confirm")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Confirm
              </button>
              {it.status === "pending" && (
                <button disabled={busy === it.submissionId} onClick={() => act(it.submissionId, "reject")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-400/30 text-rose-500 text-xs font-bold disabled:opacity-50">
                  <X className="w-3.5 h-3.5" /> Dispute
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
