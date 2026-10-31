"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Check, X, ArrowLeft, User, Users2, TrendingUp } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

interface ClanMember { user_id: string; name: string; email: string; role: string; join_date: string; }
interface Team { players: ClanMember[]; name: string; }

const TEAM_CONFIGS = [
  { key: "team1" as const, label: "Team 1", gradient: "from-blue-500 to-teal-600", accent: "sky", chip: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/40", selBg: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/40" },
  { key: "team2" as const, label: "Team 2", gradient: "from-emerald-500 to-teal-600", accent: "emerald", chip: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40", selBg: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40" },
];

function TeamPanel({
  config, team, setTeam, members, membersLoading, seriesType,
}: {
  config: typeof TEAM_CONFIGS[number];
  team: Team;
  setTeam: (t: Team) => void;
  members: ClanMember[];
  membersLoading: boolean;
  seriesType: "singles" | "doubles";
}) {
  const needed = seriesType === "doubles" ? 2 : 1;
  const ok = team.players.length >= needed;

  const toggle = (m: ClanMember) => {
    const has = team.players.some(p => p.user_id === m.user_id);
    setTeam({ ...team, players: has ? team.players.filter(p => p.user_id !== m.user_id) : [...team.players, m] });
  };

  return (
    <div className={`sport-card border transition-all ${ok ? "border-emerald-400/20" : ""}`}>
      {/* Team color bar */}
      <div className={`h-1 bg-gradient-to-r ${config.gradient}`} />

      <div className="p-4 space-y-4">
        {/* Team header */}
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-bold text-sm">{config.key === "team1" ? "T1" : "T2"}</span>
          </div>
          <input
            type="text"
            value={team.name}
            onChange={e => setTeam({ ...team, name: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white font-bold text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>

        {/* Selected chips */}
        {team.players.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Selected</p>
            <div className="flex flex-wrap gap-1.5">
              {team.players.map(p => (
                <button
                  key={p.user_id}
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold hover:bg-rose-100 hover:dark:bg-rose-500/15 hover:text-rose-600 hover:dark:text-rose-400 hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors group ${config.chip}`}
                >
                  {p.name}
                  <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Player status */}
        <div className={`text-xs px-3 py-2 rounded-xl ${ok ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20" : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"}`}>
          {ok
            ? `✓ ${team.players.length} player${team.players.length > 1 ? "s" : ""} selected`
            : `Select ${needed} player${needed > 1 ? "s" : ""} (${team.players.length}/${needed})`}
        </div>

        {/* Member grid */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Clan Members</p>
          {membersLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
              {members.map(m => {
                const sel = team.players.some(p => p.user_id === m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggle(m)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all border ${
                      sel
                        ? config.selBg
                        : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/20"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      sel ? (config.key === "team1" ? "bg-blue-600 text-white" : "bg-emerald-600 text-white") : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                    }`}>
                      {sel ? <Check className="w-3 h-3" /> : m.name[0]}
                    </div>
                    <span className="truncate">{m.name}</span>
                  </button>
                );
              })}
              {members.length === 0 && (
                <p className="col-span-2 text-sm text-slate-400 py-2">No clan members found</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeriesCreator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clanId = searchParams.get("clanId");

  const [seriesName, setSeriesName] = useState("");
  const [seriesType, setSeriesType] = useState<"singles" | "doubles">("singles");
  const [totalMatches, setTotalMatches] = useState(5);
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [team1, setTeam1] = useState<Team>({ players: [], name: "Team 1" });
  const [team2, setTeam2] = useState<Team>({ players: [], name: "Team 2" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clanId) return;
    setMembersLoading(true);
    fetchWithAuth(`/api/clans/get_clanmembers?clanId=${clanId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setMembers(d.members); })
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [clanId]);

  const needed = seriesType === "doubles" ? 2 : 1;
  const canSubmit = seriesName.trim() && team1.players.length >= needed && team2.players.length >= needed;

  const createSeries = async () => {
    if (!canSubmit) { alert("Please complete all required fields"); return; }
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/clans/series/create_series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clanId,
          name: seriesName,
          type: seriesType,
          totalMatches,
          Team1_players: JSON.stringify(team1.players),
          Team2players: JSON.stringify(team2.players),
          team1_name: team1.name,
          team2_name: team2.name,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      router.push(`/clan/series-matches?clanId=${clanId}`);
    } catch {
      alert("Failed to create series. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up pb-10">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white leading-none">Create Series</h1>
          <p className="text-xs text-slate-400 mt-0.5">Set up a head-to-head match series</p>
        </div>
      </div>

      {/* ── Step 1: Series details ── */}
      <div className="sport-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">1</span>
          </div>
          <h2 className="section-heading">Series Details</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Series Name</label>
            <input
              type="text"
              value={seriesName}
              onChange={e => setSeriesName(e.target.value)}
              placeholder="e.g. Championship Finals Series"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">Match Type</p>
            <div className="flex gap-2">
              {(["singles", "doubles"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setSeriesType(t)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    seriesType === t
                      ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500 shadow-glow-blue-sm"
                      : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/40"
                  }`}
                >
                  {t === "singles" ? <User className="w-4 h-4" /> : <Users2 className="w-4 h-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">
              Total Matches in Series
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {[3, 5, 7, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setTotalMatches(n)}
                  className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
                    totalMatches === n
                      ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500 shadow-glow-blue-sm"
                      : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/40"
                  }`}
                >
                  {n}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-xs text-slate-400">Custom:</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={totalMatches}
                  onChange={e => setTotalMatches(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm text-center font-bold focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Best of {totalMatches} — first to {Math.ceil(totalMatches / 2)} wins</p>
          </div>
        </div>
      </div>

      {/* ── Step 2: Teams ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">2</span>
          </div>
          <h2 className="section-heading">Teams & Players</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {TEAM_CONFIGS.map(cfg => (
            <TeamPanel
              key={cfg.key}
              config={cfg}
              team={cfg.key === "team1" ? team1 : team2}
              setTeam={cfg.key === "team1" ? setTeam1 : setTeam2}
              members={members}
              membersLoading={membersLoading}
              seriesType={seriesType}
            />
          ))}
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="sport-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ready to start?</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {team1.name} vs {team2.name} · {seriesType}
          </p>
          {!canSubmit && (
            <p className="text-xs text-amber-500 mt-1">
              {!seriesName.trim() ? "Enter a series name" :
               team1.players.length < needed || team2.players.length < needed ? `Each team needs ${needed} player${needed > 1 ? "s" : ""}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={createSeries}
          disabled={loading || !canSubmit}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-bold text-sm transition-all shadow-glow-blue-sm hover:shadow-glow-violet disabled:shadow-none disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          {loading ? "Creating…" : "Create Series"}
        </button>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex flex-col items-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );
}

export default function CreateSeries() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SeriesCreator />
    </Suspense>
  );
}
