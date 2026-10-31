"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Check, X, ArrowLeft, Swords, RefreshCw, Trophy, User, Users } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

interface ClanMember { user_id: string; name: string; email: string; role: string; join_date: string; }
interface Team { team_name: string; players: ClanMember[]; }
interface Group { group_name: string; teams: number[]; match_repeat_count: number; }

const FORMAT_OPTIONS = [
  {
    id: "knockout" as const,
    icon: Swords,
    label: "Knockout",
    desc: "Single elimination — lose once, you're out",
    gradient: "from-rose-500 to-red-600",
    bg: "dark:bg-rose-950/30 bg-rose-50",
    border: "dark:border-rose-500/20 border-rose-200",
    active: "dark:bg-rose-950/60 border-rose-500/50",
  },
  {
    id: "round_robin" as const,
    icon: RefreshCw,
    label: "Round Robin",
    desc: "Everyone plays everyone — best record wins",
    gradient: "from-blue-500 to-teal-600",
    bg: "dark:bg-blue-950/30 bg-blue-50",
    border: "dark:border-blue-500/20 border-blue-200",
    active: "dark:bg-blue-950/60 border-blue-500/50",
  },
  {
    id: "group_knockout" as const,
    icon: Trophy,
    label: "Group + KO",
    desc: "Group stage funnels into a knockout bracket",
    gradient: "from-amber-500 to-orange-600",
    bg: "dark:bg-amber-950/30 bg-amber-50",
    border: "dark:border-amber-500/20 border-amber-200",
    active: "dark:bg-amber-950/60 border-amber-500/50",
  },
];

function SectionLabel({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-white">{step}</span>
      </div>
      <h2 className="section-heading">{label}</h2>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 w-fit">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 disabled:opacity-40 transition-colors font-bold text-lg"
      >−</button>
      <span className="w-12 text-center font-bold text-slate-800 dark:text-white bg-white dark:bg-[#0C0E21] h-10 flex items-center justify-center border-x border-slate-200 dark:border-white/10 stat-num text-xl">
        {value}
      </span>
      <button
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        disabled={max !== undefined && value >= max}
        className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 disabled:opacity-40 transition-colors font-bold text-lg"
      >+</button>
    </div>
  );
}

function TournamentCreator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clanId = searchParams.get("clanId");

  const [tournamentName, setTournamentName] = useState("");
  const [tournamentType, setTournamentType] = useState<"singles" | "doubles">("singles");
  const [playerMode, setPlayerMode] = useState(true); // singles-only: pick players directly
  const [tournamentFormat, setTournamentFormat] = useState<"knockout" | "round_robin" | "group_knockout">("knockout");
  const [numberOfTeams, setNumberOfTeams] = useState(2);
  const [clanMembers, setClanMembers] = useState<ClanMember[]>([]);

  // Team mode state
  const [teams, setTeams] = useState<Team[]>([
    { team_name: "Team 1", players: [] },
    { team_name: "Team 2", players: [] },
  ]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(0);

  // Player mode state
  const [selectedPlayers, setSelectedPlayers] = useState<ClanMember[]>([]);

  const [groups, setGroups] = useState<Group[]>([{ group_name: "Group A", teams: [], match_repeat_count: 1 }]);
  const [teamsPerGroup, setTeamsPerGroup] = useState(2);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);

  const isTeamInOtherGroup = (ti: number, gi: number) =>
    groups.some((g, i) => i !== gi && g.teams.includes(ti));

  useEffect(() => {
    if (!clanId) return;
    setMembersLoading(true);
    fetchWithAuth(`/api/clans/get_clanmembers?clanId=${clanId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setClanMembers(d.members); })
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [clanId]);

  // When switching to doubles, force team mode
  const handleTypeChange = (t: "singles" | "doubles") => {
    setTournamentType(t);
    if (t === "doubles") setPlayerMode(false);
  };

  // Derived: effective teams used for submission
  const effectiveTeams: Team[] = playerMode && tournamentType === "singles"
    ? selectedPlayers.map(p => ({ team_name: p.name, players: [p] }))
    : teams;

  const effectiveCount = playerMode && tournamentType === "singles"
    ? selectedPlayers.length
    : numberOfTeams;

  // Team mode: adjust teams array when count changes
  const handleTeamCount = (n: number) => {
    if (n < 2) n = 2;
    setNumberOfTeams(n);
    if (n > teams.length) {
      const added = [...teams];
      for (let i = teams.length + 1; i <= n; i++) added.push({ team_name: `Team ${i}`, players: [] });
      setTeams(added);
    } else {
      setTeams(teams.slice(0, n));
    }
  };

  const togglePlayer = (ti: number, member: ClanMember) => {
    const updated = [...teams];
    const idx = updated[ti].players.findIndex(p => p.user_id === member.user_id);
    if (idx >= 0) updated[ti].players = updated[ti].players.filter(p => p.user_id !== member.user_id);
    else updated[ti].players = [...updated[ti].players, member];
    setTeams(updated);
  };

  const toggleSelectedPlayer = (member: ClanMember) => {
    const idx = selectedPlayers.findIndex(p => p.user_id === member.user_id);
    if (idx >= 0) {
      const next = selectedPlayers.filter(p => p.user_id !== member.user_id);
      setSelectedPlayers(next);
      // remove from groups that reference this player's slot
      const removedIdx = idx;
      setGroups(gs => gs.map(g => ({
        ...g,
        teams: g.teams.filter(t => t !== removedIdx).map(t => t > removedIdx ? t - 1 : t),
      })));
    } else {
      setSelectedPlayers([...selectedPlayers, member]);
    }
  };

  const toggleTeamInGroup = (gi: number, ti: number) => {
    const g = [...groups];
    const has = g[gi].teams.includes(ti);
    g[gi].teams = has ? g[gi].teams.filter(t => t !== ti) : [...g[gi].teams, ti];
    setGroups(g);
  };

  const addGroup = () =>
    setGroups([...groups, { group_name: `Group ${String.fromCharCode(65 + groups.length)}`, teams: [], match_repeat_count: 1 }]);

  const removeGroup = (i: number) => { if (groups.length > 1) setGroups(groups.filter((_, idx) => idx !== i)); };

  const knockoutSize = groups.length * teamsPerGroup;
  const isPow2 = knockoutSize >= 2 && (knockoutSize & (knockoutSize - 1)) === 0;
  const groupKnockoutInvalid = tournamentFormat === "group_knockout" && !isPow2;

  const createTournament = async () => {
    if (!tournamentName.trim()) { alert("Please enter a tournament name"); return; }

    if (playerMode && tournamentType === "singles") {
      if (selectedPlayers.length < 2) { alert("Select at least 2 players"); return; }
    } else {
      if (effectiveTeams.some(t => t.players.length === 0)) { alert("All teams must have at least one player"); return; }
      if (tournamentType === "doubles" && effectiveTeams.some(t => t.players.length < 2)) { alert("Doubles: each team needs at least 2 players"); return; }
    }

    if (tournamentFormat === "group_knockout" && groups.some(g => g.teams.length < 2)) { alert("Each group must have at least 2 teams"); return; }
    if (groupKnockoutInvalid) return;

    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/clans/tournaments/create_tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clanId,
          tournament_name: tournamentName,
          tournament_type: tournamentType,
          format: tournamentFormat,
          start_date: startDate,
          status: "upcoming",
          teams: effectiveTeams.map(t => ({ team_name: t.team_name, players: JSON.stringify(t.players.map(p => p.user_id)) })),
          groups: tournamentFormat === "group_knockout" ? groups.map(g => ({ group_name: g.group_name, teams: g.teams, match_repeat_count: g.match_repeat_count })) : [],
          teams_per_group: teamsPerGroup,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      router.push(`/clan/tournaments?clanId=${clanId}`);
    } catch {
      alert("Failed to create tournament. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // True if a player (by user_id) is already used in any team-mode team
  const playerUsedInTeam = (uid: string, excludeTi: number) =>
    teams.some((t, i) => i !== excludeTi && t.players.some(p => p.user_id === uid));

  const displayTeams = playerMode && tournamentType === "singles"
    ? selectedPlayers.map(p => ({ team_name: p.name, players: [p] }))
    : teams;

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
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white leading-none">Create Tournament</h1>
          <p className="text-xs text-slate-400 mt-0.5">Set up a new competition for your clan</p>
        </div>
      </div>

      {/* ── Step 1: Details ── */}
      <div className="sport-card p-5">
        <SectionLabel step={1} label="Tournament Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tournament Name</label>
            <input
              type="text"
              value={tournamentName}
              onChange={e => setTournamentName(e.target.value)}
              placeholder="e.g. Summer Championship 2026"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── Step 2: Configuration ── */}
      <div className="sport-card p-5">
        <SectionLabel step={2} label="Configuration" />

        {/* Match Type */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">Match Type</p>
          <div className="flex gap-2">
            {(["singles", "doubles"] as const).map(t => (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  tournamentType === t
                    ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500 shadow-glow-blue-sm"
                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/40"
                }`}
              >
                {t === "singles" ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Entry Mode — singles only */}
        {tournamentType === "singles" && (
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">Entry Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlayerMode(true)}
                className={`relative p-4 rounded-xl border text-left transition-all ${
                  playerMode
                    ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500/50 ring-2 ring-blue-500/30"
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40"
                }`}
              >
                {playerMode && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-teal-600 flex items-center justify-center mb-2">
                  <User className="w-4 h-4 text-white" />
                </div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Player Mode</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">Pick players directly — each player competes solo</p>
              </button>
              <button
                onClick={() => setPlayerMode(false)}
                className={`relative p-4 rounded-xl border text-left transition-all ${
                  !playerMode
                    ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500/50 ring-2 ring-blue-500/30"
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40"
                }`}
              >
                {!playerMode && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <p className="font-bold text-sm text-slate-800 dark:text-white">Team Mode</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">Create named teams — multiple players per team</p>
              </button>
            </div>
          </div>
        )}

        {/* Format */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">Tournament Format</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isActive = tournamentFormat === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setTournamentFormat(opt.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    isActive ? `${opt.active} ring-2 ring-blue-500/30` : `${opt.bg} ${opt.border} hover:opacity-80`
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${opt.gradient} flex items-center justify-center mb-2.5`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Number of teams — team mode only */}
        {!playerMode && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">Number of Teams</p>
            <div className="flex items-center gap-4">
              <Stepper value={numberOfTeams} min={2} onChange={handleTeamCount} />
              <span className="text-sm text-slate-400">{numberOfTeams} teams competing</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 3a: Player Mode — flat player picker ── */}
      {playerMode && tournamentType === "singles" && (
        <div className="sport-card p-5">
          <SectionLabel step={3} label="Select Players" />
          <p className="text-xs text-slate-400 mb-4">
            Each selected player enters as a solo competitor.
            {selectedPlayers.length >= 2
              ? <span className="text-emerald-500 ml-1 font-semibold">{selectedPlayers.length} players selected ✓</span>
              : <span className="text-amber-500 ml-1">Select at least 2</span>}
          </p>

          {/* Selected chips */}
          {selectedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedPlayers.map((p, i) => (
                <button
                  key={p.user_id}
                  onClick={() => toggleSelectedPlayer(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400 transition-colors group border border-blue-200 dark:border-blue-500/20"
                >
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {p.name}
                  <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {/* Member grid */}
          {membersLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {clanMembers.map(m => {
                const sel = selectedPlayers.some(p => p.user_id === m.user_id);
                const selIdx = selectedPlayers.findIndex(p => p.user_id === m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleSelectedPlayer(m)}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium text-left transition-all border ${
                      sel
                        ? "bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/40"
                        : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-white/8 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-500/5"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      sel ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                    }`}>
                      {sel ? <span className="text-[10px]">{selIdx + 1}</span> : m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-sm">{m.name}</p>
                      <p className="text-[10px] text-slate-400 truncate capitalize">{m.role}</p>
                    </div>
                  </button>
                );
              })}
              {clanMembers.length === 0 && (
                <p className="col-span-3 text-sm text-slate-400 py-2">No clan members found</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3b: Team Mode — expandable team cards ── */}
      {!playerMode && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">3</span>
            </div>
            <h2 className="section-heading">Teams & Players</h2>
          </div>

          <div className="space-y-3">
            {teams.map((team, ti) => {
              const isOpen = expandedTeam === ti;
              const hasPlayers = team.players.length > 0;
              const needsMore = tournamentType === "doubles" && team.players.length < 2;

              return (
                <div key={ti} className={`sport-card border transition-all ${
                  needsMore ? "border-amber-400/40 dark:border-amber-400/30" :
                  hasPlayers ? "border-emerald-400/30 dark:border-emerald-500/20" : ""
                }`}>
                  <button
                    onClick={() => setExpandedTeam(isOpen ? null : ti)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm ${
                      hasPlayers && !needsMore ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-blue-500 to-teal-600"
                    }`}>
                      {ti + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 dark:text-white">{team.team_name}</p>
                      <p className={`text-xs mt-0.5 ${
                        needsMore ? "text-amber-500" :
                        hasPlayers ? "text-emerald-500" : "text-slate-400"
                      }`}>
                        {needsMore
                          ? `${team.players.length}/2 players — need ${2 - team.players.length} more`
                          : hasPlayers
                          ? `${team.players.length} player${team.players.length > 1 ? "s" : ""} selected`
                          : "No players selected yet"}
                      </p>
                    </div>
                    <div className="hidden sm:flex gap-1 flex-wrap max-w-[180px]">
                      {team.players.map(p => (
                        <span key={p.user_id} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                          {p.name.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-white/8 p-4 space-y-4">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5 block">Team Name</label>
                        <input
                          type="text"
                          value={team.team_name}
                          onChange={e => {
                            const t = [...teams]; t[ti].team_name = e.target.value; setTeams(t);
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
                        />
                      </div>

                      {team.players.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Selected</p>
                          <div className="flex flex-wrap gap-1.5">
                            {team.players.map(p => (
                              <button
                                key={p.user_id}
                                onClick={() => togglePlayer(ti, p)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-rose-100 hover:dark:bg-rose-500/15 hover:text-rose-600 hover:dark:text-rose-400 transition-colors group"
                              >
                                {p.name}
                                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Add Players</p>
                        {membersLoading ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {clanMembers.map(m => {
                              const sel = team.players.some(p => p.user_id === m.user_id);
                              const usedElsewhere = playerUsedInTeam(m.user_id, ti);
                              return (
                                <button
                                  key={m.user_id}
                                  disabled={usedElsewhere}
                                  onClick={() => !usedElsewhere && togglePlayer(ti, m)}
                                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all ${
                                    sel
                                      ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40"
                                      : usedElsewhere
                                      ? "bg-slate-50 dark:bg-white/3 text-slate-400 border border-slate-100 dark:border-white/5 opacity-50 cursor-not-allowed"
                                      : "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/8 hover:border-blue-300 dark:hover:border-blue-500/40"
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                                    sel ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                                  }`}>
                                    {sel ? <Check className="w-3 h-3" /> : m.name[0]}
                                  </div>
                                  <span className="truncate">{m.name.split(" ")[0]}</span>
                                </button>
                              );
                            })}
                            {clanMembers.length === 0 && (
                              <p className="col-span-3 text-sm text-slate-400 py-2">No clan members found</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 4: Groups (group_knockout only) ── */}
      {tournamentFormat === "group_knockout" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">4</span>
              </div>
              <h2 className="section-heading">Group Configuration</h2>
            </div>
            <button
              onClick={addGroup}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Group
            </button>
          </div>

          <div className={`mb-4 sport-card p-4 border ${isPow2 ? "border-emerald-400/30" : "border-amber-400/40"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPow2 ? "bg-emerald-500" : "bg-amber-500"}`}>
                {isPow2 ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  Knockout bracket: <span className={`stat-num text-lg ${isPow2 ? "text-emerald-500" : "text-amber-500"}`}>{knockoutSize}</span> teams
                </p>
                <p className={`text-xs mt-0.5 ${isPow2 ? "text-emerald-500" : "text-amber-500"}`}>
                  {groups.length} groups × {teamsPerGroup} advancing {isPow2 ? "✓ Valid" : "— must be a power of 2 (2, 4, 8, 16…)"}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Top teams advancing per group:</span>
                  <Stepper value={teamsPerGroup} min={1} onChange={setTeamsPerGroup} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((group, gi) => (
              <div key={gi} className="sport-card p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-1">
                    {String.fromCharCode(65 + gi)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={group.group_name}
                        onChange={e => { const g = [...groups]; g[gi].group_name = e.target.value; setGroups(g); }}
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm font-bold focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all"
                      />
                      {groups.length > 1 && (
                        <button onClick={() => removeGroup(gi)} className="p-2 rounded-xl text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Rounds per team:</span>
                      <Stepper
                        value={group.match_repeat_count}
                        min={1}
                        onChange={v => { const g = [...groups]; g[gi].match_repeat_count = v; setGroups(g); }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  {playerMode ? "Players" : "Teams"} in this group
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {displayTeams.map((team, ti) => {
                    const inThis = group.teams.includes(ti);
                    const inOther = isTeamInOtherGroup(ti, gi);
                    return (
                      <button
                        key={ti}
                        disabled={inOther}
                        onClick={() => !inOther && toggleTeamInGroup(gi, ti)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border ${
                          inThis
                            ? "bg-amber-100 dark:bg-amber-500/20 border-amber-400/40 text-amber-700 dark:text-amber-300"
                            : inOther
                            ? "bg-slate-50 dark:bg-white/3 border-slate-100 dark:border-white/5 text-slate-400 opacity-50 cursor-not-allowed"
                            : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/8 text-slate-600 dark:text-slate-300 hover:border-amber-400/40 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                        }`}
                      >
                        {team.team_name}
                        {inOther && <span className="block text-[10px] text-slate-400 mt-0.5">other group</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="sport-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ready to launch?</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {effectiveCount} {playerMode && tournamentType === "singles" ? "players" : "teams"} · {tournamentType} · {FORMAT_OPTIONS.find(f => f.id === tournamentFormat)?.label}
          </p>
          {groupKnockoutInvalid && (
            <p className="text-xs text-amber-500 mt-1">Fix the knockout bracket size first.</p>
          )}
        </div>
        <button
          onClick={createTournament}
          disabled={loading || groupKnockoutInvalid}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-bold text-sm transition-all shadow-glow-blue-sm hover:shadow-glow-violet disabled:shadow-none disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          {loading ? "Creating…" : "Create Tournament"}
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

export default function CreateTournament() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TournamentCreator />
    </Suspense>
  );
}
