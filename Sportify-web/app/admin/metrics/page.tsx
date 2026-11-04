"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import type { Metrics, Retention } from "@/lib/metrics";

// Internal: weekly north-star metrics. Only uids in PLATFORM_ADMIN_UIDS get data.
export default function MetricsPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setError("");
    fetchWithAuth(`/api/admin/metrics?weeks=${weeks}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(r.status === 403 ? "This page is for Sportify staff." : d.error ?? "Failed to load");
        setData(d);
      })
      .catch(e => setError(e.message));
  }, [user, weeks]);

  const pct = (r: Retention | null) =>
    r === null ? "—" : `${Math.round(r.rate * 100)}% (${r.retained})${r.complete ? "" : " *"}`;

  if (!user) return <p className="text-slate-400">Sign in to view metrics.</p>;
  if (error) return <p className="text-slate-400">{error}</p>;
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>;

  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500";
  const td = "px-3 py-2 tabular-nums";
  const rows = [...data.weeks].reverse();
  const cohorts = [...data.cohorts].reverse().filter(c => c.size > 0);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="display-font font-bold text-2xl text-slate-900 dark:text-white">Weekly metrics</h1>
          <p className="text-sm text-slate-500 mt-1">
            WAC = users with at least one confirmed ranked match (clan or tournament) in the ISO week, Monday–Sunday,
            UTC{data.tzOffsetMinutes >= 0 ? "+" : "−"}{Math.floor(Math.abs(data.tzOffsetMinutes) / 60)}:{String(Math.abs(data.tzOffsetMinutes) % 60).padStart(2, "0")}.
            The top row is the current week so far.
          </p>
        </div>
        <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}
          className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-sm">
          {[4, 8, 12, 26, 52].map(n => <option key={n} value={n}>{n} weeks</option>)}
        </select>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-white/5">
            <tr>
              <th className={th}>Week</th><th className={th}>Starts</th><th className={th}>WAC</th>
              <th className={th}>Matches</th><th className={th}>Matches / competitor</th><th className={th}>New users</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.week} className="border-t border-slate-100 dark:border-white/5">
                <td className={td}>{w.week}</td><td className={td}>{w.weekStart}</td>
                <td className={`${td} font-bold`}>{w.wac}</td><td className={td}>{w.matches}</td>
                <td className={td}>{w.matchesPerCompetitor}</td><td className={td}>{w.newUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-1">Retention by signup week</h2>
        <p className="text-sm text-slate-500 mb-3">
          W1 / W4: share of the cohort who were competitors 1 / 4 weeks after the week they signed up. * = that week isn&apos;t over yet.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr><th className={th}>Signup week</th><th className={th}>Users</th><th className={th}>W1</th><th className={th}>W4</th></tr>
            </thead>
            <tbody>
              {cohorts.length ? cohorts.map(c => (
                <tr key={c.week} className="border-t border-slate-100 dark:border-white/5">
                  <td className={td}>{c.week}</td><td className={td}>{c.size}</td>
                  <td className={td}>{pct(c.w1)}</td><td className={td}>{pct(c.w4)}</td>
                </tr>
              )) : (
                <tr><td className={td} colSpan={4}>No signups in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
