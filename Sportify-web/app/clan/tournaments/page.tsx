"use client";

import { useState, useEffect, Suspense } from "react";
import { Loader2, Plus, Calendar, Users, User, Swords, ChevronRight, X, Zap, Trash2 } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type TStatus = "upcoming" | "ongoing" | "completed" | "open";
type Tournament = {
  tournament_id: number; clan_id: number; tournament_name: string;
  tournament_type: "singles" | "doubles"; format: "knockout" | "round_robin" | "group_knockout";
  start_date: string; end_date: string | null; status: TStatus; winner_team_id: number | null;
  // these columns only exist after host_tournament is first called — treat as optional
  is_hosted?: number; max_participants?: number; registration_mode?: "players" | "teams";
};
type HostedReg  = { registration_id: number; user_id: string; user_name: string; hosted_team_id: number | null };
type HostedTeam = { hosted_team_id: number; team_name: string; created_by_user_name: string; member_count: number };

const FORMAT_LABELS: Record<string, string> = { knockout: "Knockout", round_robin: "Round Robin", group_knockout: "Group + KO" };
const FORMAT_ICONS:  Record<string, string> = { knockout: "⚔️", round_robin: "🔄", group_knockout: "🏆" };

// ── Host Tournament Modal ─────────────────────────────────────────────────────

function HostModal({ clanId, onClose, onCreated }: { clanId: string; onClose: () => void; onCreated: () => void }) {
  const [name,            setName]            = useState("");
  const [type,            setType]            = useState<"singles"|"doubles">("singles");
  const [format,          setFormat]          = useState<"knockout"|"round_robin"|"group_knockout">("knockout");
  const [regMode,         setRegMode]         = useState<"players"|"teams">("teams");
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [teamsPerGroup,   setTeamsPerGroup]   = useState(4);
  const [loading,         setLoading]         = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/clans/tournaments/host_tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId, tournament_name: name.trim(), tournament_type: type, format, registration_mode: regMode, max_participants: maxParticipants, teams_per_group: teamsPerGroup }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onCreated();
    } catch (e) { alert((e as Error).message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md sport-card rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white fill-white" /></div>
            <h2 className="font-bold text-slate-900 dark:text-white">Host Tournament</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tournament Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Clan Championship"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Match Type</label>
            <div className="flex gap-2">
              {(["singles", "doubles"] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${type === t ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-500/40"}`}>
                  {t === "singles" ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["knockout", "round_robin", "group_knockout"] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all text-center ${format === f ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-500/40"}`}>
                  {FORMAT_ICONS[f]} {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Registration Mode</label>
            <div className="flex gap-2">
              {([["teams", "Players form teams"], ["players", "Players join individually"]] as const).map(([mode, lbl]) => (
                <button key={mode} onClick={() => setRegMode(mode)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${regMode === mode ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-500/40"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Max {regMode === "teams" ? "Teams" : "Players"}
            </label>
            <div className="flex gap-2 flex-wrap items-center">
              {[4, 8, 16, 32].map(n => (
                <button key={n} onClick={() => setMaxParticipants(n)}
                  className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${maxParticipants === n ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"}`}>
                  {n}
                </button>
              ))}
              <input type="number" min={2} max={256} value={maxParticipants}
                onChange={e => setMaxParticipants(Math.max(2, parseInt(e.target.value) || 2))}
                className="w-20 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-center font-bold text-slate-800 dark:text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
            </div>
          </div>

          {format === "group_knockout" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Teams per Group</label>
              <div className="flex gap-2">
                {[3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => setTeamsPerGroup(n)}
                    className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${teamsPerGroup === n ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-white/8 flex-shrink-0">
          {!name.trim() && (
            <p className="text-xs text-amber-500 mb-2">Enter a tournament name to continue.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Players in this clan can see and join from the tournaments page.</p>
            <button onClick={submit} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold text-sm transition-all flex-shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? "Hosting…" : "Host"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Join Modal ────────────────────────────────────────────────────────────────

function JoinModal({ tournament, currentUserId, currentUserName, onClose, onJoined }: {
  tournament: Tournament; currentUserId: string; currentUserName: string;
  onClose: () => void; onJoined: () => void;
}) {
  const [registrations, setRegistrations] = useState<HostedReg[]>([]);
  const [teams,         setTeams]         = useState<HostedTeam[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [joining,       setJoining]       = useState(false);
  const [newTeamName,   setNewTeamName]   = useState("");
  const [view,          setView]          = useState<"main"|"create_team">("main");
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  const reload = async () => {
    const res  = await fetchWithAuth(`/api/clans/tournaments/hosted_registrations?tournamentId=${tournament.tournament_id}`);
    const data = await res.json();
    if (data.success) {
      setRegistrations(data.registrations || []);
      setTeams(data.teams || []);
      setAlreadyJoined(data.registrations?.some((r: HostedReg) => r.user_id === currentUserId) ?? false);
      if (data.tournament) setHostedMeta({ registration_mode: data.tournament.registration_mode, max_participants: data.tournament.max_participants });
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const join = async (action: string, extra?: { teamName?: string; hostedTeamId?: number }) => {
    try {
      setJoining(true);
      const res = await fetchWithAuth("/api/clans/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.tournament_id, userName: currentUserName, action, ...extra }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onJoined();
    } catch (e) { alert((e as Error).message || "Failed to join"); setJoining(false); }
  };

  // registration_mode and max_participants come from the hosted_registrations fetch (not the list)
  const [hostedMeta, setHostedMeta] = useState<{ registration_mode: string; max_participants: number } | null>(null);
  const isTeamMode     = hostedMeta?.registration_mode === "teams";
  const max            = hostedMeta?.max_participants || 0;
  const maxTeamsFull   = isTeamMode && max > 0 && teams.length >= max;
  const maxPlayersFull = !isTeamMode && max > 0 && registrations.length >= max;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md sport-card rounded-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/8 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">{tournament.tournament_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{FORMAT_ICONS[tournament.format]} {FORMAT_LABELS[tournament.format]} · {tournament.tournament_type}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>
          ) : alreadyJoined ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">You&apos;re registered!</p>
              <p className="text-sm text-slate-400">Wait for the coach to start the tournament.</p>
            </div>
          ) : isTeamMode ? (
            view === "main" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 text-sm">
                  <span className="text-slate-500">{teams.length}{max > 0 ? `/${max}` : ""} teams</span>
                  <span className="text-xs text-slate-400">{registrations.length} players total</span>
                </div>

                {teams.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Join an existing team</p>
                    {teams.map(team => (
                      <div key={team.hosted_team_id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-100 dark:border-white/8 bg-white dark:bg-white/3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{team.team_name}</p>
                          <p className="text-xs text-slate-400">Created by {team.created_by_user_name} · {team.member_count} member{team.member_count !== 1 ? "s" : ""}</p>
                        </div>
                        <button onClick={() => join("join_team", { hostedTeamId: team.hosted_team_id })} disabled={joining}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:bg-slate-400">
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => setView("create_team")} disabled={maxTeamsFull}
                  className={`w-full py-2.5 rounded-xl border text-sm font-semibold transition-all ${maxTeamsFull ? "border-slate-200 dark:border-white/8 text-slate-400 cursor-not-allowed" : "border-dashed border-purple-400 dark:border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/8"}`}>
                  {maxTeamsFull ? `Max ${max} teams reached — join an existing team` : "+ Create New Team"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => setView("main")} className="text-xs text-purple-500 hover:text-purple-400 font-medium">← Back</button>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Team Name</label>
                  <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Enter your team name"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20" />
                </div>
                <button onClick={() => join("create_team", { teamName: newTeamName })} disabled={joining || !newTeamName.trim()}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-400 text-white font-bold text-sm transition-all">
                  {joining ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create & Join Team"}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 text-sm text-slate-500">
                {registrations.length}{max > 0 ? `/${max}` : ""} players registered
              </div>
              <button onClick={() => join("join_player")} disabled={joining || maxPlayersFull}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-400 text-white font-bold transition-all">
                {joining ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : maxPlayersFull ? "Tournament Full" : "Join Tournament"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Open Tournament Card ──────────────────────────────────────────────────────

function OpenTournamentCard({ tournament, isAdmin, adminChecked, currentUserId, onJoin, onStarted }: {
  tournament: Tournament; isAdmin: boolean; adminChecked: boolean; currentUserId: string;
  onJoin: (t: Tournament) => void; onStarted: () => void;
}) {
  const [regCount,     setRegCount]     = useState<number | null>(null);
  const [teamCount,    setTeamCount]    = useState<number | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [starting,     setStarting]     = useState(false);
  const [isTeamMode,   setIsTeamMode]   = useState(false);
  const [max,          setMax]          = useState(0);

  useEffect(() => {
    fetchWithAuth(`/api/clans/tournaments/hosted_registrations?tournamentId=${tournament.tournament_id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRegCount(d.registrations.length);
          setTeamCount(d.teams.length);
          setIsRegistered(d.registrations.some((r: HostedReg) => r.user_id === currentUserId));
          setIsTeamMode(d.tournament?.registration_mode === "teams");
          setMax(d.tournament?.max_participants || 0);
        }
      }).catch(() => {});
  }, [tournament.tournament_id, currentUserId]);

  const startTournament = async () => {
    if (!confirm("Start the tournament? Registrations will close and the bracket will be generated.")) return;
    try {
      setStarting(true);
      const res  = await fetchWithAuth("/api/clans/tournaments/start_hosted", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.tournament_id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onStarted();
    } catch (e) { alert((e as Error).message || "Failed to start"); setStarting(false); }
  };

  const displayCount = isTeamMode ? teamCount : regCount;
  const countLabel   = isTeamMode ? "teams" : "players";

  return (
    <div className="group relative overflow-hidden rounded-2xl border dark:bg-purple-950/30 bg-purple-50 dark:border-purple-500/15 border-purple-200"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div className="absolute left-0 top-0 w-[3px] h-full bg-gradient-to-b from-purple-500 to-blue-600 rounded-l-2xl" />
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full blur-3xl opacity-15 bg-purple-500" />

      <div className="relative pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h3 className="display-font font-bold text-xl sm:text-2xl leading-tight text-slate-900 dark:text-white">
            {tournament.tournament_name}
          </h3>
          <span className="badge flex items-center gap-1.5 flex-shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-400/10 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> Open
          </span>
        </div>

        <div className="h-px mb-3 bg-purple-200 dark:bg-purple-500/15" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
            <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
              {tournament.tournament_type === "singles" ? <User className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {tournament.tournament_type.charAt(0).toUpperCase() + tournament.tournament_type.slice(1)}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 dark:text-slate-400">{FORMAT_ICONS[tournament.format]} {FORMAT_LABELS[tournament.format]}</span>
            {displayCount !== null && (
              <>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-purple-600 dark:text-purple-300">
                  {displayCount}{max > 0 ? `/${max}` : ""} {countLabel}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!adminChecked ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : isAdmin ? (
              <button onClick={startTournament} disabled={starting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all">
                {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Swords className="w-3.5 h-3.5" />}
                {starting ? "Starting…" : "Start"}
              </button>
            ) : isRegistered ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Registered</span>
            ) : (
              <button onClick={() => onJoin(tournament)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all">
                <Plus className="w-3.5 h-3.5" /> Join
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Regular Tournament Card ───────────────────────────────────────────────────

function TournamentCard({ tournament, isAdmin, onDelete }: { tournament: Tournament; isAdmin: boolean; onDelete: (id: number) => void }) {
  const router      = useRouter();
  const date        = new Date(tournament.start_date);
  const isCompleted = tournament.status === "completed";
  const isOngoing   = tournament.status === "ongoing";

  const cfg = isCompleted
    ? { accent: "from-emerald-500 to-teal-600", glow: "bg-emerald-500", tint: "dark:bg-emerald-950/40 bg-emerald-50", border: "dark:border-emerald-500/15 border-emerald-200", text: "text-emerald-600 dark:text-emerald-400", div: "bg-emerald-200 dark:bg-emerald-500/20", badge: "badge-completed" }
    : isOngoing
    ? { accent: "from-blue-500 to-teal-600",    glow: "bg-blue-500",    tint: "dark:bg-blue-950/40 bg-blue-50",       border: "dark:border-blue-500/15 border-blue-200",     text: "text-blue-600 dark:text-blue-400",     div: "bg-blue-200 dark:bg-blue-500/15",     badge: "badge-ongoing" }
    : { accent: "from-amber-500 to-orange-600", glow: "bg-amber-500",   tint: "dark:bg-amber-950/30 bg-amber-50",     border: "dark:border-amber-500/12 border-amber-200",   text: "text-amber-600 dark:text-amber-400",   div: "bg-amber-200 dark:bg-amber-500/15",   badge: "badge-upcoming" };

  return (
    <div onClick={() => router.push(`/clan/tournaments/details?clanId=${tournament.clan_id}&tournamentId=${tournament.tournament_id}`)}
      className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-1 ${cfg.tint} ${cfg.border}`}
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div className={`absolute left-0 top-0 w-[3px] h-full bg-gradient-to-b ${cfg.accent} rounded-l-2xl`} />
      <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full blur-3xl opacity-15 ${cfg.glow}`} />

      <div className="relative pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h3 className={`display-font font-bold text-xl sm:text-2xl leading-tight transition-colors ${isCompleted ? "text-slate-700 dark:text-white" : isOngoing ? "text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400" : "text-slate-800 dark:text-slate-100"}`}>
            {tournament.tournament_name}
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`badge ${cfg.badge}`}>
              {isOngoing && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
            </span>
            {isAdmin && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (confirm("Delete this tournament and all its matches?")) onDelete(tournament.tournament_id);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                title="Delete tournament"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className={`h-px mb-3 ${cfg.div}`} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className={`flex items-center gap-1.5 ${cfg.text}`}>
              {tournament.tournament_type === "singles" ? <User className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {tournament.tournament_type.charAt(0).toUpperCase() + tournament.tournament_type.slice(1)}
            </span>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <span className="text-slate-500 dark:text-slate-400">{FORMAT_ICONS[tournament.format]} {FORMAT_LABELS[tournament.format]}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-slate-400"><Calendar className="w-3 h-3" />{date.toLocaleDateString()}</span>
            <ChevronRight className={`w-4 h-4 ${cfg.text} opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUS_TABS  = ["all", "open", "ongoing", "completed"] as const;
const TYPE_TABS    = ["all", "singles", "doubles"] as const;
const FORMAT_TABS  = ["all", "knockout", "round_robin", "group_knockout"] as const;
const FORMAT_SHORT: Record<string, string> = { all: "All Formats", knockout: "KO", round_robin: "Round Robin", group_knockout: "Group+KO" };

function TournamentContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const clanId       = searchParams.get("clanId");

  const [activeTab,        setActiveTab]        = useState<typeof STATUS_TABS[number]>("all");
  const [tournamentType,   setTournamentType]   = useState<typeof TYPE_TABS[number]>("all");
  const [tournamentFormat, setTournamentFormat] = useState<typeof FORMAT_TABS[number]>("all");
  const [list,             setList]             = useState<Tournament[]>([]);
  const [isLoading,        setIsLoading]        = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [isAdmin,          setIsAdmin]          = useState(false);
  const [adminChecked,     setAdminChecked]     = useState(false);
  const [currentUserId,    setCurrentUserId]    = useState("");
  const [currentUserName,  setCurrentUserName]  = useState("");
  const [showHostModal,    setShowHostModal]    = useState(false);
  const [joinModal,        setJoinModal]        = useState<Tournament | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(user => {
      if (user && clanId) {
        setCurrentUserId(user.uid);
        setCurrentUserName(user.displayName || user.email?.split("@")[0] || "Player");
        checkAdmin(clanId);
      } else {
        setAdminChecked(true); // not logged in → definitely not admin
      }
    });
    return () => unsub();
  }, [clanId]);

  async function checkAdmin(id: string) {
    try {
      const res = await fetchWithAuth(`/api/clans/checkadmin?clanId=${id}`);
      if (res.ok) { const d = await res.json(); setIsAdmin(d.isAdmin === true); }
    } catch {}
    finally { setAdminChecked(true); }
  }

  const deleteTournament = async (tournamentId: number) => {
    try {
      const res = await fetchWithAuth(`/api/clans/tournaments/delete_tournament?tournamentId=${tournamentId}&clanId=${clanId}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) setList(prev => prev.filter(t => t.tournament_id !== tournamentId));
      else alert(d.error || "Failed to delete");
    } catch { alert("Failed to delete tournament"); }
  };

  const loadTournaments = async () => {
    if (!clanId) { setError("No clan ID"); setIsLoading(false); return; }
    try {
      const res  = await fetchWithAuth(`/api/clans/tournaments/get_tournaments?id=${clanId}`);
      const data = await res.json();
      if (data.success) { setList(data.data || []); setError(null); }
      else setError(data.error || "Error loading tournaments");
    } catch { setError("Failed to load tournaments"); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadTournaments(); }, [clanId]);

  // Separate open (hosted, awaiting players) from running/done
  const openTournaments = list.filter(t => t.status === "open");
  const regularList     = list.filter(t => t.status !== "open");

  const filteredRegular = regularList.filter(t =>
    (activeTab        === "all" || t.status          === activeTab) &&
    (tournamentType   === "all" || t.tournament_type === tournamentType) &&
    (tournamentFormat === "all" || t.format          === tournamentFormat)
  );

  const showOpen    = activeTab === "all" || activeTab === "open";
  const showRegular = activeTab !== "open";
  const isEmpty     = (showOpen ? openTournaments.length : 0) + (showRegular ? filteredRegular.length : 0) === 0;

  const counts = {
    open:      openTournaments.length,
    ongoing:   regularList.filter(t => t.status === "ongoing").length,
    completed: regularList.filter(t => t.status === "completed").length,
  };

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Stats */}
      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Open",     count: counts.open,      color: "text-purple-600 dark:text-purple-400",  bg: "bg-purple-50 dark:bg-purple-500/8 border-purple-200 dark:border-purple-500/15" },
            { label: "Live",     count: counts.ongoing,   color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-500/8 border-blue-200 dark:border-blue-500/15" },
            { label: "Done",     count: counts.completed, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-200 dark:border-emerald-500/15" },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${bg}`}>
              <p className={`stat-num text-2xl ${color}`}>{count}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + CTAs */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-shrink-0 flex items-center gap-1.5 ${activeTab === t ? "tab-pill-active" : "tab-pill-inactive"}`}>
              {t === "all" ? "All" : t === "open" ? "Open" : t === "ongoing" ? "Live" : "Done"}
              {t === "open" && counts.open > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === "open" ? "bg-white/20" : "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300"}`}>{counts.open}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab !== "open" && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none items-center">
            {TYPE_TABS.map(t => (
              <button key={t} onClick={() => setTournamentType(t)}
                className={`flex-shrink-0 ${tournamentType === t ? "tab-pill-active" : "tab-pill-inactive"}`}>
                {t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <div className="w-px h-5 bg-slate-200 dark:bg-white/10 flex-shrink-0 mx-0.5" />
            {FORMAT_TABS.map(t => (
              <button key={t} onClick={() => setTournamentFormat(t)}
                className={`flex-shrink-0 ${tournamentFormat === t ? "tab-pill-active" : "tab-pill-inactive"}`}>
                {FORMAT_SHORT[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => clanId && router.push(`/clan/tournaments/create?clanId=${clanId}`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm">
            <Plus className="w-4 h-4" /> Create Tournament
          </button>
          <button onClick={() => setShowHostModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all">
            <Zap className="w-4 h-4" /> Host Tournament
          </button>
        </div>
      )}

      {/* Lists */}
      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading tournaments…</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-400/5 border border-rose-400/20 text-rose-400 text-sm">{error}</div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mx-auto mb-4">
            <Swords className="w-7 h-7 text-slate-400" />
          </div>
          <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">No tournaments found</p>
          <p className="text-sm text-slate-400">
            {activeTab !== "all" || tournamentType !== "all" || tournamentFormat !== "all"
              ? "Try changing your filter settings"
              : "This clan doesn't have any tournaments yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {showOpen && openTournaments.length > 0 && (
            <>
              {activeTab === "all" && regularList.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Open for Registration</p>
              )}
              {openTournaments.map(t => (
                <OpenTournamentCard key={t.tournament_id} tournament={t} isAdmin={isAdmin}
                  adminChecked={adminChecked} currentUserId={currentUserId}
                  onJoin={setJoinModal} onStarted={loadTournaments} />
              ))}
              {activeTab === "all" && regularList.length > 0 && <div className="h-px bg-slate-100 dark:bg-white/6" />}
            </>
          )}
          {showRegular && filteredRegular.map(t => <TournamentCard key={t.tournament_id} tournament={t} isAdmin={isAdmin} onDelete={deleteTournament} />)}
        </div>
      )}

      {showHostModal && clanId && (
        <HostModal clanId={clanId} onClose={() => setShowHostModal(false)} onCreated={() => { setShowHostModal(false); loadTournaments(); }} />
      )}
      {joinModal && (
        <JoinModal tournament={joinModal} currentUserId={currentUserId} currentUserName={currentUserName}
          onClose={() => setJoinModal(null)} onJoined={() => { setJoinModal(null); loadTournaments(); }} />
      )}
    </div>
  );
}

export default function TournamentListPage() {
  return (
    <Suspense fallback={<div className="flex flex-col items-center py-20 gap-3"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /><p className="text-sm text-slate-400">Loading…</p></div>}>
      <TournamentContent />
    </Suspense>
  );
}
