"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Users, User, Loader2, Swords, RefreshCw, Check, X, Pencil, Lock } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import ShareCardButton from "@/app/components/ShareCardButton";
import RatingDelta from "@/app/components/RatingDelta";

// Define TypeScript interfaces
interface TournamentTeam {
  team_id: number;
  team_name: string;
  players: string; // JSON string of player data
  playersArray?: Player[]; // Parsed players data
  playersDetails?: Player[]; 
}

interface Player {
  user_id: string;
  name: string;
}

interface TournamentMatch {
  match_id: number;
  team1_id: number;
  team2_id: number;
  winner_team_id: number | null;
  score_details: string; // JSON string
  match_stage: string;
  match_date: string;
  round_number: number;
  match_position: number;
  phase: "group" | "knockout";
  team1_players: string | null; // JSON array of user IDs
  team2_players: string | null;
  /** Rating change per player id for a rated match, e.g. { uid: 14 }. */
  rating_changes?: Record<string, number>;
  /** A result recorded by someone who played in it, waiting for the other side or another admin. */
  pending_result?: PendingResult | null;
  parsedScore?: {
    score: string;
    games: { team1: number, team2: number }[];
  };
}

interface PendingResult {
  submissionId: number;
  status: "pending" | "disputed";
  winnerTeamId: number | null;
  score_details: string;
  submittedByName: string;
  canConfirm: boolean;
}

/** "21–15 · 21–18" from a stored score ({ score } JSON or plain text). */
const pendingScore = (raw: string) => {
  let score = raw;
  try { const p = JSON.parse(raw); if (p && typeof p.score === "string") score = p.score; } catch { /* plain score */ }
  return score.split(",").map(g => g.trim().replace("-", "–")).filter(Boolean).join(" · ");
};

interface TournamentGroup {
  group_id: number;
  group_name: string;
  match_repeat_count: number;
  teams: TournamentTeam[];
}

interface Tournament {
  tournament_id: number;
  clan_id: number;
  tournament_name: string;
  tournament_type: "singles" | "doubles";
  format: "knockout" | "round_robin" | "group_knockout";
  start_date: string;
  end_date: string | null;
  status: "upcoming" | "ongoing" | "completed";
  winner_team_id: number | null;
  winnerTeam?: TournamentTeam;
}

// Create a wrapper component that uses useSearchParams
function TournamentDetailsContent() {
  const searchParams = useSearchParams();
  const clanId = searchParams.get("clanId");
  const tournamentId = searchParams.get("tournamentId");
  
  const [activeTab, setActiveTab] = useState<"teams" | "matches" | "brackets" | "groups" | "standings">("teams");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [groups, setGroups] = useState<TournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  
  // State for match update
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null);
  const [scoreInput, setScoreInput] = useState("");
  const [updatingScore, setUpdatingScore] = useState(false);
  const [team1SelectedPlayers, setTeam1SelectedPlayers] = useState<string[]>([]);
  const [team2SelectedPlayers, setTeam2SelectedPlayers] = useState<string[]>([]);
  const [completingTournament, setCompletingTournament] = useState(false);
  const [generatingKnockout, setGeneratingKnockout] = useState(false);
  const [advancingToKnockout, setAdvancingToKnockout] = useState(false);
  const [advancingCount, setAdvancingCount] = useState(2);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  // knockoutStarted = any format that has generated knockout-phase matches
  const knockoutStarted = matches.some(m => m.phase === "knockout");
  const groupMatchesDone = tournament?.format === "group_knockout" &&
    matches.filter(m => m.phase !== "knockout").length > 0 &&
    matches.filter(m => m.phase !== "knockout").every(m => m.winner_team_id !== null);
  const roundRobinDone = tournament?.format === "round_robin" &&
    matches.length > 0 &&
    matches.every(m => m.winner_team_id !== null);
  
  // Fetch tournament details, teams, matches, and groups
  useEffect(() => {
    const fetchTournamentData = async () => {
      try {
        setLoading(true);
        const response = await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`);
        const data = await response.json();
        
        if (data.success) {
          setTournament(data.tournament);
          
          // Process teams - parse players JSON
          // Process teams - handle players data appropriately
          // Process teams - handle players and player details
          const processedTeams = data.teams.map((team: TournamentTeam) => {
            // Keep existing code for backward compatibility
            let playersArray = [];
            
            // Check if players is already an array
            if (Array.isArray(team.players)) {
              playersArray = team.players;
            } else if (typeof team.players === 'string') {
              try {
                playersArray = JSON.parse(team.players);
              } catch (e) {
                console.error("Failed to parse players data", e);
              }
            }
            
            return {
              ...team,
              playersArray,
              playersDetails: team.playersDetails || [] // Use the new player details from API
            };
          });
          setTeams(processedTeams);
          
          // Process matches - parse score details
          const processedMatches = data.matches.map((match: TournamentMatch) => {
            let parsedScore = undefined;
            try {
              const scoreDetails = JSON.parse(match.score_details);
              parsedScore = scoreDetails;
            } catch (e) {
              console.error("Failed to parse score details", e);
            }
            return {
              ...match,
              parsedScore
            };
          });
          setMatches(processedMatches);
          
          // Process groups if available
          if (data.groups && data.groups.length > 0) {
            setGroups(data.groups);
            setActiveGroup(data.groups[0].group_id);
          }
          
          // Set the appropriate default tab based on tournament format
          if (data.tournament.format === "knockout") {
            setActiveTab("brackets");
          } else if (data.tournament.format === "group_knockout") {
            setActiveTab("groups");
          } else {
            setActiveTab("matches");
          }
        } else {
          console.error("Failed to load tournament:", data.error || "Unknown error");
        }
      } catch (error) {
        console.error("Error fetching tournament data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (clanId && tournamentId) {
      fetchTournamentData();
    }
  }, [clanId, tournamentId]);

  // Helper function to find team by ID
  const getTeamById = (teamId: number) => {
    return teams.find(team => team.team_id === teamId);
  };

  // How many players each side needs based on tournament type
  const playersNeeded = tournament?.tournament_type === "doubles" ? 2 : 1;

  // Open match update dialog — pre-populate player selections if already set
  const openUpdateScore = (match: TournamentMatch) => {
    setSelectedMatch(match);
    setScoreInput(match.parsedScore?.score ?? "");

    // Pre-populate team1 player selection
    if (match.team1_players) {
      try { setTeam1SelectedPlayers(JSON.parse(match.team1_players)); } catch { setTeam1SelectedPlayers([]); }
    } else {
      // Auto-select if team has exactly the right number of players
      const t1 = getTeamById(match.team1_id);
      const t1Players = t1?.playersDetails?.map(p => p.user_id) ?? [];
      setTeam1SelectedPlayers(t1Players.length === playersNeeded ? t1Players : []);
    }

    if (match.team2_players) {
      try { setTeam2SelectedPlayers(JSON.parse(match.team2_players)); } catch { setTeam2SelectedPlayers([]); }
    } else {
      const t2 = getTeamById(match.team2_id);
      const t2Players = t2?.playersDetails?.map(p => p.user_id) ?? [];
      setTeam2SelectedPlayers(t2Players.length === playersNeeded ? t2Players : []);
    }
  };

  // Close match update dialog
  const closeUpdateScore = () => {
    setSelectedMatch(null);
    setScoreInput("");
    setTeam1SelectedPlayers([]);
    setTeam2SelectedPlayers([]);
  };

  // Toggle a player in a team selection (respects playersNeeded cap)
  const toggleTeamPlayer = (side: 1 | 2, userId: string) => {
    const [selected, setSelected] = side === 1
      ? [team1SelectedPlayers, setTeam1SelectedPlayers]
      : [team2SelectedPlayers, setTeam2SelectedPlayers];

    if (playersNeeded === 1) {
      // Singles: radio behaviour
      setSelected([userId]);
    } else {
      // Doubles: toggle, max 2
      if (selected.includes(userId)) {
        setSelected(selected.filter(id => id !== userId));
      } else if (selected.length < playersNeeded) {
        setSelected([...selected, userId]);
      }
    }
  };

  // Update match score
  const updateMatchScore = async () => {
    if (!selectedMatch || !scoreInput.trim()) return;
    
    try {
      setUpdatingScore(true);
      
      // Parse the score to determine winner
      const games = parseScore(scoreInput);
      let team1Wins = 0;
      let team2Wins = 0;
      
      games.forEach(game => {
        if (game.team1 > game.team2) team1Wins++;
        else if (game.team2 > game.team1) team2Wins++;
      });
      
      const winner_team_id = team1Wins > team2Wins 
        ? selectedMatch.team1_id 
        : team2Wins > team1Wins 
          ? selectedMatch.team2_id 
          : null;
      
      // Prepare the score details object
      const scoreDetails = {
        score: scoreInput,
        games: games
      };
      
      const response = await fetchWithAuth("/api/clans/tournaments/update_match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clanId,
          tournamentId,
          matchId: selectedMatch.match_id,
          winner_team_id,
          score_details: JSON.stringify(scoreDetails),
          team1_players: team1SelectedPlayers.length > 0 ? team1SelectedPlayers : undefined,
          team2_players: team2SelectedPlayers.length > 0 ? team2SelectedPlayers : undefined,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh tournament data
        const refreshResponse = await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`);
        const refreshData = await refreshResponse.json();
        
        if (refreshData.success) {
          // Process matches with parsed score details
          const processedMatches = refreshData.matches.map((match: TournamentMatch) => {
            let parsedScore = undefined;
            try {
              const scoreDetails = JSON.parse(match.score_details);
              parsedScore = scoreDetails;
            } catch (e) {
              console.error("Failed to parse score details", e);
            }
            return {
              ...match,
              parsedScore
            };
          });
          setMatches(processedMatches);
          
          // Update tournament data in case status changes
          setTournament(refreshData.tournament);
          
          closeUpdateScore();
          alert(data.status === "pending"
            ? "Saved. You played in this match, so it counts once a player on the other side or another admin confirms it."
            : "Match score updated successfully!");
        }
      } else {
        throw new Error(data.error || "Failed to update match");
      }
    } catch (error) {
      console.error("Error updating match:", error);
      alert(error instanceof Error && error.message ? error.message : "Failed to update match. Please try again.");
    } finally {
      setUpdatingScore(false);
    }
  };

  // Confirm or dispute a result that's waiting on the other side
  const resolvePending = async (pending: PendingResult, action: "confirm" | "reject") => {
    if (action === "reject" && !confirm("Dispute this result? A host or clan admin who didn't play will decide.")) return;
    try {
      setResolvingId(pending.submissionId);
      const res = await fetchWithAuth("/api/clans/matches/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: pending.submissionId, action }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      const refresh = await (await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`)).json();
      if (refresh.success) {
        setMatches(refresh.matches.map((m: TournamentMatch) => {
          let parsedScore = undefined;
          try { parsedScore = JSON.parse(m.score_details); } catch { /* not played */ }
          return { ...m, parsedScore };
        }));
        setTournament(refresh.tournament);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update the result");
    } finally {
      setResolvingId(null);
    }
  };

  // Confirm / Dispute buttons, or who it's waiting on
  const PendingActions = ({ pending }: { pending: PendingResult }) => pending.canConfirm ? (
    <span className="flex items-center gap-2 flex-shrink-0 ml-2">
      {pending.status === "pending" && (
        <button disabled={resolvingId === pending.submissionId} onClick={() => resolvePending(pending, "reject")}
          className="text-xs font-semibold text-rose-500 hover:text-rose-400 disabled:opacity-50">Dispute</button>
      )}
      <button disabled={resolvingId === pending.submissionId} onClick={() => resolvePending(pending, "confirm")}
        className="flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:text-emerald-400 disabled:opacity-50">
        {resolvingId === pending.submissionId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Confirm
      </button>
    </span>
  ) : (
    <span className="text-[10px] text-amber-500 flex-shrink-0 ml-2">{pending.status === "disputed" ? "Disputed" : "Waiting for confirmation"}</span>
  );

  // Parse score string (e.g. "21-19, 15-21, 21-18") into an array of game results
  const parseScore = (scoreStr: string) => {
    const games = scoreStr.split(',').map(game => {
      const [team1, team2] = game.trim().split('-').map(Number);
      return { team1, team2 };
    });
    return games;
  };

  // Complete tournament
  const completeTournament = async () => {
    // Check if there are any matches with no scores
    const unplayedMatches = matches.filter(match => !match.winner_team_id);
    if (unplayedMatches.length > 0) {
      if (!confirm("There are unplayed matches. Are you sure you want to complete the tournament?")) {
        return;
      }
    }

    try {
      setCompletingTournament(true);
      
      const response = await fetchWithAuth("/api/clans/tournaments/complete_tournament", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clanId,
          tournamentId
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh tournament data
        const refreshResponse = await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`);
        const refreshData = await refreshResponse.json();
        
        if (refreshData.success) {
          setTournament(refreshData.tournament);
          alert("Tournament completed successfully!");
        }
      } else {
        throw new Error(data.error || "Failed to complete tournament");
      }
    } catch (error) {
      console.error("Error completing tournament:", error);
      alert(error instanceof Error && error.message !== "Failed" ? error.message : "Failed to complete tournament. Please try again.");
    } finally {
      setCompletingTournament(false);
    }
  };

  // Generate knockout bracket from group stage results
  const generateKnockout = async () => {
    try {
      setGeneratingKnockout(true);
      const res = await fetchWithAuth("/api/clans/tournaments/start_knockout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId, tournamentId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      // Refresh data and switch to brackets tab
      const refreshRes = await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`);
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        const processedMatches = refreshData.matches.map((m: TournamentMatch) => {
          let parsedScore;
          try { parsedScore = JSON.parse(m.score_details); } catch {}
          return { ...m, parsedScore };
        });
        setMatches(processedMatches);
      }
      setActiveTab("brackets");
    } catch (err) {
      console.error("Error generating knockout:", err);
      alert(err instanceof Error && err.message !== "Failed" ? err.message : "Failed to generate knockout bracket. Please try again.");
    } finally {
      setGeneratingKnockout(false);
    }
  };

  // Get round-robin standings across all teams (non-knockout matches only)
  const getRoundRobinStandings = () => {
    const standings = teams.map(team => ({
      team,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
    }));
    matches
      .filter(m => m.phase !== "knockout")
      .forEach(match => {
        if (!match.winner_team_id) return;
        const t1 = standings.findIndex(s => s.team.team_id === match.team1_id);
        const t2 = standings.findIndex(s => s.team.team_id === match.team2_id);
        if (t1 >= 0) {
          standings[t1].played++;
          if (match.winner_team_id === match.team1_id) { standings[t1].won++; standings[t1].points += 2; }
          else standings[t1].lost++;
        }
        if (t2 >= 0) {
          standings[t2].played++;
          if (match.winner_team_id === match.team2_id) { standings[t2].won++; standings[t2].points += 2; }
          else standings[t2].lost++;
        }
      });
    return standings.sort((a, b) => b.points - a.points || b.won - a.won);
  };

  // Advance round-robin to knockout
  const advanceToKnockout = async () => {
    try {
      setAdvancingToKnockout(true);
      const res = await fetchWithAuth("/api/clans/tournaments/advance_round_robin_to_knockout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId, tournamentId, advancingCount }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      const refreshRes = await fetchWithAuth(`/api/clans/tournaments/get_tournament_details?clanId=${clanId}&tournamentId=${tournamentId}`);
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        const processedMatches = refreshData.matches.map((m: TournamentMatch) => {
          let parsedScore;
          try { parsedScore = JSON.parse(m.score_details); } catch {}
          return { ...m, parsedScore };
        });
        setMatches(processedMatches);
      }
      setActiveTab("brackets");
    } catch (err) {
      console.error("Error advancing to knockout:", err);
      alert(err instanceof Error && err.message !== "Failed" ? err.message : "Failed to advance to knockout. Please try again.");
    } finally {
      setAdvancingToKnockout(false);
    }
  };

  // Get matches for a specific group
  const getMatchesForGroup = (groupId: number) => {
    if (tournament?.format !== "group_knockout") return [];
    
    // For group matches, get the teams in this group
    const group = groups.find(g => g.group_id === groupId);
    if (!group) return [];
    
    const groupTeamIds = group.teams.map(team => team.team_id);
    
    // Filter matches where both teams are in this group
    return matches.filter(match => 
      groupTeamIds.includes(match.team1_id) && 
      groupTeamIds.includes(match.team2_id)
    );
  };

  // Get standings for a group
  const getGroupStandings = (groupId: number) => {
    const group = groups.find(g => g.group_id === groupId);
    if (!group) return [];
    
    const standings: {
      team: TournamentTeam;
      played: number;
      won: number;
      lost: number;
      points: number;
    }[] = [];
    
    // Initialize standings with all teams in the group
    group.teams.forEach(team => {
      standings.push({
        team,
        played: 0,
        won: 0,
        lost: 0,
        points: 0
      });
    });
    
    // Calculate stats from matches
    const groupMatches = getMatchesForGroup(groupId);
    
    groupMatches.forEach(match => {
      // Skip matches that haven't been played
      if (!match.winner_team_id) return;
      
      // Find team indices in standings
      const team1Index = standings.findIndex(s => s.team.team_id === match.team1_id);
      const team2Index = standings.findIndex(s => s.team.team_id === match.team2_id);
      
      if (team1Index >= 0) {
        standings[team1Index].played++;
        if (match.winner_team_id === match.team1_id) {
          standings[team1Index].won++;
          standings[team1Index].points += 2; // 2 points for a win
        } else {
          standings[team1Index].lost++;
          standings[team1Index].points += 0; // 1 point for a loss
        }
      }
      
      if (team2Index >= 0) {
        standings[team2Index].played++;
        if (match.winner_team_id === match.team2_id) {
          standings[team2Index].won++;
          standings[team2Index].points += 2; // 2 points for a win
        } else {
          standings[team2Index].lost++;
          standings[team2Index].points += 0; // 1 point for a loss
        }
      }
    });
    
    // Sort by points (descending)
    return standings.sort((a, b) => b.points - a.points);
  };

  const router = useRouter();

  const FORMAT_LABELS: Record<string, string> = { knockout: "Knockout", round_robin: "Round Robin", group_knockout: "Group + KO" };
  const FORMAT_ICONS: Record<string, React.ReactNode> = { knockout: <Swords className="w-3 h-3" />, round_robin: <RefreshCw className="w-3 h-3" />, group_knockout: <Trophy className="w-3 h-3" /> };

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading tournament…</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="p-4 rounded-xl border border-rose-400/20 bg-rose-400/5 text-rose-400 text-sm text-center py-12">
        Tournament not found or failed to load.
      </div>
    );
  }

  // ── Locked matches: matches that must not be edited because they have already
  //    affected the bracket (editing would collapse downstream results).
  const lockedMatchIds = (() => {
    const locked = new Set<number>();

    // Group+KO: lock ALL group-stage matches once the knockout phase has started.
    // Editing group results would invalidate the standings that determined who advanced.
    if (tournament.format === "group_knockout" && knockoutStarted) {
      matches.filter(m => m.phase === "group").forEach(m => locked.add(m.match_id));
    }

    // Any knockout format: lock a bracket match whose winner is already seeded
    // into the next round (editing it would break the bracket progression).
    const bracketMatches = tournament.format === "knockout"
      ? matches
      : matches.filter(m => m.phase === "knockout");
    const roundMap = new Map<number, TournamentMatch[]>();
    bracketMatches.forEach(m => {
      if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
      roundMap.get(m.round_number)!.push(m);
    });
    const sortedRoundNums = Array.from(roundMap.keys()).sort((a, b) => a - b);
    for (let ri = 0; ri < sortedRoundNums.length - 1; ri++) {
      const currentMatches = roundMap.get(sortedRoundNums[ri]) ?? [];
      const nextMatches    = roundMap.get(sortedRoundNums[ri + 1]) ?? [];
      const teamsInNext    = new Set(nextMatches.flatMap(m => [m.team1_id, m.team2_id]));
      for (const m of currentMatches) {
        if (m.winner_team_id && teamsInNext.has(m.winner_team_id)) {
          locked.add(m.match_id);
        }
      }
    }
    return locked;
  })();

  // ── Shared match card used in Matches tab and Groups tab ──
  const MatchCard = ({ match }: { match: TournamentMatch }) => {
    const t1 = getTeamById(match.team1_id);
    const t2 = getTeamById(match.team2_id);
    const t1Win = match.winner_team_id === match.team1_id;
    const t2Win = match.winner_team_id === match.team2_id;
    const done = !!match.winner_team_id;
    const pending = match.pending_result;
    const scoreDisplay = match.parsedScore?.games?.map(g => `${g.team1}–${g.team2}`).join("  ·  ");
    const accentGrad = done ? "from-emerald-500 to-teal-600" : pending ? "from-amber-500 to-orange-500" : "from-blue-500 to-teal-600";
    const changes = match.rating_changes ?? {};
    const lineup = (raw: string | null, team?: TournamentTeam) => {
      let ids: string[] = [];
      try { const parsed = raw ? JSON.parse(raw) : null; if (Array.isArray(parsed)) ids = parsed.map(String); } catch { /* no selection */ }
      if (!ids.length) ids = team?.playersDetails?.map(p => p.user_id) ?? [];
      return ids.filter(id => changes[id] != null);
    };
    const playerName = (uid: string) =>
      teams.flatMap(t => t.playersDetails ?? []).find(p => p.user_id === uid)?.name ?? "Player";
    const rated = done ? [...lineup(match.team1_players, t1), ...lineup(match.team2_players, t2)] : [];

    return (
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0C0E21]">
        <div className={`h-0.5 w-full bg-gradient-to-r ${accentGrad}`} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{match.match_stage}</span>
            <span className={`badge ${done ? "badge-completed" : "badge-ongoing"}`}>
              {done ? "Done" : pending ? (pending.status === "disputed" ? "Disputed" : "Awaiting confirmation") : "Pending"}
            </span>
          </div>
          <div className="space-y-1.5">
            {/* Team 1 */}
            <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${t1Win ? "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-300 dark:border-emerald-500/25" : "bg-slate-50 dark:bg-white/4 border-slate-100 dark:border-white/5"}`}>
              <div className="flex items-center gap-2 min-w-0">
                {t1Win && <Trophy className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                {!t1Win && done && <div className="w-3.5 flex-shrink-0" />}
                <span className={`font-bold text-sm truncate ${t1Win ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>{t1?.team_name ?? "TBD"}</span>
              </div>
              {match.parsedScore?.games && <span className={`stat-num text-lg ml-2 flex-shrink-0 ${t1Win ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{match.parsedScore.games.filter(g => g.team1 > g.team2).length}</span>}
            </div>
            <div className="flex items-center gap-2 px-1"><div className="flex-1 h-px bg-slate-100 dark:bg-white/5" /><span className="text-[10px] font-black tracking-widest text-slate-400">VS</span><div className="flex-1 h-px bg-slate-100 dark:bg-white/5" /></div>
            {/* Team 2 */}
            <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${t2Win ? "bg-emerald-50 dark:bg-emerald-500/8 border-emerald-300 dark:border-emerald-500/25" : "bg-slate-50 dark:bg-white/4 border-slate-100 dark:border-white/5"}`}>
              <div className="flex items-center gap-2 min-w-0">
                {t2Win && <Trophy className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                {!t2Win && done && <div className="w-3.5 flex-shrink-0" />}
                <span className={`font-bold text-sm truncate ${t2Win ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>{t2?.team_name ?? "TBD"}</span>
              </div>
              {match.parsedScore?.games && <span className={`stat-num text-lg ml-2 flex-shrink-0 ${t2Win ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{match.parsedScore.games.filter(g => g.team2 > g.team1).length}</span>}
            </div>
          </div>
          {rated.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 px-1">
              {rated.map(uid => (
                <span key={uid} className="inline-flex items-center gap-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{playerName(uid)}</span>
                  <RatingDelta value={changes[uid]} />
                </span>
              ))}
            </div>
          )}
          {pending && (
            <p className="mt-2.5 px-1 text-xs text-amber-600 dark:text-amber-400">
              {pending.submittedByName} recorded {getTeamById(pending.winnerTeamId ?? 0)?.team_name ?? "a result"} winning {pendingScore(pending.score_details)}.
              {" "}Waiting for confirmation from the other side or another admin.
            </p>
          )}
          {/* Score + action row */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs text-slate-400 truncate">{scoreDisplay || (pending ? "Not counted yet" : "Not played yet")}</span>
            {done && (
              <span className="ml-auto flex-shrink-0">
                <ShareCardButton payload={{ kind: "match", source: "tournament", matchId: match.match_id }} />
              </span>
            )}
            {pending ? <PendingActions pending={pending} /> : tournament.status !== "completed" && (
              lockedMatchIds.has(match.match_id) ? (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 flex-shrink-0 ml-2">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              ) : (
                <button onClick={() => openUpdateScore(match)} className="flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors flex-shrink-0 ml-2">
                  <Pencil className="w-3 h-3" />{match.winner_team_id ? "Edit" : "Score"}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Standings row component ──
  const StandingsTable = ({ rows }: { rows: { team: TournamentTeam; played: number; won: number; lost: number; points: number }[] }) => (
    <div className="sport-card overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_32px_32px_32px_40px] text-xs font-bold uppercase tracking-wide text-slate-400 px-4 py-2.5 border-b border-slate-100 dark:border-white/8">
        <span>#</span><span>Team</span><span className="text-center">P</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-center">PTS</span>
      </div>
      {rows.map((s, i) => (
        <div key={s.team.team_id} className={`grid grid-cols-[auto_1fr_32px_32px_32px_40px] items-center px-4 py-3 border-b border-slate-50 dark:border-white/4 last:border-0 ${i === 0 ? "bg-amber-50 dark:bg-amber-500/5" : ""}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mr-3 ${i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200" : i === 2 ? "bg-orange-300 dark:bg-orange-700 text-white" : "bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400"}`}>{i + 1}</div>
          <span className="font-semibold text-sm text-slate-800 dark:text-white truncate mr-2">{s.team.team_name}</span>
          <span className="text-center text-sm tabular-nums text-slate-500 dark:text-slate-400">{s.played}</span>
          <span className="text-center text-sm tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{s.won}</span>
          <span className="text-center text-sm tabular-nums text-rose-500 dark:text-rose-400">{s.lost}</span>
          <span className={`text-center stat-num text-base font-bold tabular-nums ${i === 0 ? "text-amber-500" : "text-blue-600 dark:text-blue-400"}`}>{s.points}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up pb-10">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white leading-tight">{tournament.tournament_name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`badge ${tournament.tournament_type === "singles" ? "badge-singles" : "badge-doubles"}`}>
              {tournament.tournament_type === "singles" ? <User className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              {tournament.tournament_type.charAt(0).toUpperCase() + tournament.tournament_type.slice(1)}
            </span>
            <span className="badge badge-ongoing">
              {FORMAT_ICONS[tournament.format]}
              {FORMAT_LABELS[tournament.format]}
            </span>
            <span className={`badge ${tournament.status === "completed" ? "badge-completed" : tournament.status === "upcoming" ? "badge-upcoming" : "badge-ongoing"}`}>
              {tournament.status === "ongoing" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
            </span>
            <span className="text-xs text-slate-400">{new Date(tournament.start_date).toLocaleDateString()}</span>
            <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />{teams.length} teams</span>
          </div>
        </div>
      </div>

      {/* ── Winner Banner ── */}
      {tournament.status === "completed" && tournament.winnerTeam && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 dark:border-amber-400/20">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-950/60 via-yellow-950/40 to-amber-950/60" />
          <div className="absolute inset-0 court-bg opacity-20" />
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
          <div className="relative p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Tournament Champion</p>
            <h2 className="display-font font-bold text-3xl sm:text-4xl gold-shimmer">{tournament.winnerTeam.team_name}</h2>
            <Trophy className="w-8 h-8 text-amber-400 mx-auto mt-3" />
          </div>
        </div>
      )}

      {/* ── Tab Nav ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {([
          { id: "teams", label: "Teams" },
          { id: "matches", label: "Matches" },
          ...(tournament.format === "knockout" || knockoutStarted ? [{ id: "brackets", label: "Brackets" }] : []),
          ...(tournament.format === "round_robin" ? [{ id: "standings", label: "Standings" }] : []),
          ...(tournament.format === "group_knockout" ? [{ id: "groups", label: "Groups" }] : []),
        ] as { id: typeof activeTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 ${activeTab === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TEAMS TAB ── */}
      {activeTab === "teams" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {teams.map(team => {
            const isWinner = tournament.status === "completed" && tournament.winner_team_id === team.team_id;
            return (
              <div key={team.team_id} className={`sport-card p-4 border ${isWinner ? "border-amber-400/30" : ""}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isWinner ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-glow-gold-sm" : "bg-gradient-to-br from-blue-500 to-teal-600"}`}>
                    {team.team_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm truncate">{team.team_name}</h3>
                    {isWinner && <span className="text-xs text-amber-500 font-semibold">Champion</span>}
                  </div>
                  {isWinner && <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {team.playersDetails && team.playersDetails.length > 0
                    ? team.playersDetails.map((p, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium">{p.name}</span>
                      ))
                    : <span className="text-xs text-slate-400">No players assigned</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MATCHES TAB ── */}
      {activeTab === "matches" && (
        <div className="space-y-4">
          {matches.length > 0 ? (
            <>
              {/* Group by round for round_robin (knockout-only formats keep a flat list) */}
              {tournament.format === "round_robin" ? (() => {
                const roundMap = new Map<number, TournamentMatch[]>();
                matches.filter(m => m.phase !== "knockout").forEach(m => {
                  if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
                  roundMap.get(m.round_number)!.push(m);
                });
                const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);
                return (
                  <div className="space-y-6">
                    {rounds.map(([rn, rMatches]) => {
                      const allDone = rMatches.every(m => m.winner_team_id);
                      return (
                        <div key={rn}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Round {rn}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${allDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}>
                              {allDone ? "Complete" : `${rMatches.filter(m => m.winner_team_id).length}/${rMatches.length} played`}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {rMatches.sort((a, b) => a.match_position - b.match_position).map(m => <MatchCard key={m.match_id} match={m} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {matches.map(m => <MatchCard key={m.match_id} match={m} />)}
                </div>
              )}
              {tournament.status !== "completed" && tournament.format !== "round_robin" && (
                <div className="sport-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border border-amber-400/20">
                  <div>
                    <p className="font-semibold text-sm text-slate-800 dark:text-white">Finish tournament?</p>
                    <p className="text-xs text-slate-400 mt-0.5">This will determine the winner from the final match.</p>
                  </div>
                  <button onClick={completeTournament} disabled={completingTournament}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-colors disabled:opacity-50 flex-shrink-0">
                    {completingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                    {completingTournament ? "Completing…" : "Complete Tournament"}
                  </button>
                </div>
              )}
              {tournament.status !== "completed" && tournament.format === "round_robin" && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/8 border border-blue-200 dark:border-blue-500/15 text-sm text-blue-600 dark:text-blue-400 text-center">
                  Go to{" "}
                  <button className="underline font-semibold" onClick={() => setActiveTab("standings")}>Standings</button>
                  {" "}to complete or advance to knockout.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
              <Swords className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No matches yet</p>
            </div>
          )}
        </div>
      )}
      
      {/* ── BRACKETS TAB ── */}
      {activeTab === "brackets" && (tournament.format === "knockout" || knockoutStarted) && (
        <div className="space-y-4">
          {(() => {
            const bracketMatches = tournament.format === "knockout" ? matches : matches.filter(m => m.phase === "knockout");
            const roundMap = new Map<number, TournamentMatch[]>();
            bracketMatches.forEach(m => {
              if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
              roundMap.get(m.round_number)!.push(m);
            });
            const rounds = Array.from(roundMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([rn, rMatches]) => ({ round: rn, matches: [...rMatches].sort((a, b) => a.match_position - b.match_position) }));

            if (rounds.length === 0) {
              return (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
                  <Swords className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No knockout matches yet.</p>
                </div>
              );
            }

            const totalRounds = rounds.length;
            const round1Count = rounds[0]?.matches.length ?? 1;
            // Expected KO rounds based on bracket size (2 SF matches = 4 teams = 2 rounds),
            // not just how many rounds have been created yet.
            const expectedTotalRounds = Math.ceil(Math.log2(2 * round1Count));
            const CARD_H = 114;
            const SLOT_H = 140;
            const totalH = round1Count * SLOT_H;

            const getRoundLabel = (roundIdx: number) => {
              const fromEnd = expectedTotalRounds - 1 - roundIdx;
              if (fromEnd === 0) return "Final";
              if (fromEnd === 1) return "Semi Finals";
              if (fromEnd === 2) return "Quarter Finals";
              return `Round ${roundIdx + 1}`;
            };

            const getGamesWon = (match: TournamentMatch, side: "team1" | "team2") => {
              if (!match.parsedScore?.games?.length) return "";
              return String(match.parsedScore.games.filter(g => side === "team1" ? g.team1 > g.team2 : g.team2 > g.team1).length);
            };

            return (
              <div className="overflow-x-auto pb-4">
                <div className="flex" style={{ minWidth: `${totalRounds * 268 + (totalRounds - 1) * 36}px` }}>
                  {rounds.map((roundData, roundIdx) => {
                    const slotH = SLOT_H * Math.pow(2, roundIdx);
                    const CONNECTOR_W = 36;
                    return (
                      <div key={roundData.round} className="flex items-start">
                        <div style={{ width: "256px" }}>
                          {/* Round header */}
                          <div className="text-center text-xs font-bold mb-3 py-2 px-3 bg-gradient-to-r from-blue-600 to-teal-600 text-white rounded-xl tracking-widest uppercase">
                            {getRoundLabel(roundIdx)}
                          </div>
                          <div className="relative" style={{ height: `${totalH}px` }}>
                            {roundData.matches.map((match, matchIdx) => {
                              const team1 = getTeamById(match.team1_id);
                              const team2 = getTeamById(match.team2_id);
                              const t1Wins = getGamesWon(match, "team1");
                              const t2Wins = getGamesWon(match, "team2");
                              const topPos = matchIdx * slotH + (slotH - CARD_H) / 2;
                              const t1Win = match.winner_team_id === match.team1_id;
                              const t2Win = match.winner_team_id === match.team2_id;
                              const hasScore = !!match.parsedScore?.games?.length;
                              const scoreDisplay = hasScore ? match.parsedScore!.games.map(g => `${g.team1}–${g.team2}`).join(" · ") : null;

                              return (
                                <div key={match.match_id} style={{ position: "absolute", top: `${topPos}px`, width: "256px" }}
                                  className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0C0E21] shadow-sm">
                                  {/* Team 1 */}
                                  <div className={`flex items-center h-10 px-3 border-l-[3px] ${t1Win ? "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-l-transparent"}`}>
                                    <span className={`flex-1 text-sm truncate font-medium ${t1Win ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}>
                                      {team1?.team_name ?? "TBD"}
                                    </span>
                                    {team1 && hasScore && <span className={`stat-num text-base ml-2 w-5 text-right flex-shrink-0 ${t1Win ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{t1Wins}</span>}
                                  </div>
                                  <div className="border-t border-slate-100 dark:border-white/8" />
                                  {/* Team 2 */}
                                  <div className={`flex items-center h-10 px-3 border-l-[3px] ${t2Win ? "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-l-transparent"}`}>
                                    <span className={`flex-1 text-sm truncate font-medium ${t2Win ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}>
                                      {team2?.team_name ?? "TBD"}
                                    </span>
                                    {team2 && hasScore && <span className={`stat-num text-base ml-2 w-5 text-right flex-shrink-0 ${t2Win ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{t2Wins}</span>}
                                  </div>
                                  {/* Score bar */}
                                  <div className="border-t border-slate-100 dark:border-white/8 bg-slate-50 dark:bg-white/3 flex items-center h-8 px-3">
                                    <span className={`text-xs truncate flex-1 ${scoreDisplay ? "text-slate-500 dark:text-slate-400 font-medium" : match.pending_result ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-600 italic"}`}
                                      title={match.pending_result ? `${match.pending_result.submittedByName} recorded ${pendingScore(match.pending_result.score_details)}` : undefined}>
                                      {scoreDisplay ?? (match.pending_result ? pendingScore(match.pending_result.score_details) : "Not played yet")}
                                    </span>
                                    {match.pending_result ? <PendingActions pending={match.pending_result} /> : tournament.status !== "completed" && (
                                      lockedMatchIds.has(match.match_id) ? (
                                        <span className="ml-2 flex items-center gap-1 text-[10px] text-slate-400 flex-shrink-0">
                                          <Lock className="w-2.5 h-2.5" /> Locked
                                        </span>
                                      ) : (
                                        <button onClick={() => openUpdateScore(match)} className="ml-2 text-xs font-semibold text-blue-500 hover:text-blue-400 flex-shrink-0">
                                          {match.winner_team_id ? "Edit" : "Score ›"}
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Connectors */}
                        {roundIdx < rounds.length - 1 && (
                          <div className="relative flex-none" style={{ width: `${CONNECTOR_W}px`, height: `${totalH + 36}px`, marginTop: "36px" }}>
                            {roundData.matches.map((_, matchIdx) => {
                              if (matchIdx % 2 !== 0) return null;
                              const hasPair = matchIdx + 1 < roundData.matches.length;
                              const centerA = matchIdx * slotH + slotH / 2;
                              const centerB = (matchIdx + 1) * slotH + slotH / 2;
                              if (!hasPair) return <div key={matchIdx} style={{ position: "absolute", top: `${centerA - 1}px`, left: 0, width: "100%", height: "2px", backgroundColor: "#6366F1", opacity: 0.3 }} />;
                              return <div key={matchIdx} style={{ position: "absolute", top: `${centerA}px`, left: 0, width: "100%", height: `${centerB - centerA}px`, borderTop: "2px solid #6366F1", borderRight: "2px solid #6366F1", borderBottom: "2px solid #6366F1", borderRadius: "0 6px 6px 0", opacity: 0.35 }} />;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {tournament.format !== "knockout" && tournament.status !== "completed" && knockoutStarted && (
            <div className="sport-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border border-amber-400/20">
              <div>
                <p className="font-semibold text-sm text-slate-800 dark:text-white">Declare champion?</p>
                <p className="text-xs text-slate-400 mt-0.5">Finishes the tournament from the knockout final result.</p>
              </div>
              <button onClick={completeTournament} disabled={completingTournament}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-colors disabled:opacity-50 flex-shrink-0">
                {completingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                {completingTournament ? "Completing…" : "Complete Tournament"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STANDINGS TAB (round_robin) ── */}
      {activeTab === "standings" && tournament.format === "round_robin" && (
        <div className="space-y-4">
          <StandingsTable rows={getRoundRobinStandings()} />

          {roundRobinDone && !knockoutStarted && tournament.status !== "completed" && (
            <div className="sport-card p-5 space-y-4 border border-blue-400/20">
              <p className="font-semibold text-sm text-slate-800 dark:text-white">All round-robin matches complete — choose how to finish:</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={completeTournament} disabled={completingTournament}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-colors disabled:opacity-50">
                  {completingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                  {completingTournament ? "Completing…" : "Complete (Winner = #1)"}
                </button>
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 flex-wrap">
                  <span className="text-sm text-slate-600 dark:text-slate-300">Advance top</span>
                  <select value={advancingCount} onChange={e => setAdvancingCount(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-400">
                    {[2, 4, 8, 16].filter(n => n <= teams.length).map(n => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                  <span className="text-sm text-slate-600 dark:text-slate-300">to knockout</span>
                  <button onClick={advanceToKnockout} disabled={advancingToKnockout}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors disabled:opacity-50">
                    {advancingToKnockout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {advancingToKnockout ? "Generating…" : "Go →"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400">Advancing seeds the bracket: #1 vs last, #2 vs second-last, etc.</p>
            </div>
          )}

          {knockoutStarted && tournament.status !== "completed" && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-500/8 border border-blue-200 dark:border-blue-500/15">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Knockout bracket is in progress.</p>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                Complete all knockout matches, then use the <button className="underline font-semibold" onClick={() => setActiveTab("brackets")}>Brackets</button> tab to finish.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── GROUPS TAB (group_knockout) ── */}
      {activeTab === "groups" && tournament.format === "group_knockout" && groups.length > 0 && (
        <div className="space-y-4">
          {/* Group selector pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {groups.map(g => (
              <button key={g.group_id} onClick={() => setActiveGroup(g.group_id)}
                className={`flex-shrink-0 ${activeGroup === g.group_id ? "tab-pill-active" : "tab-pill-inactive"}`}>
                {g.group_name}
              </button>
            ))}
          </div>

          {activeGroup && (
            <div className="space-y-4">
              <div>
                <p className="section-heading mb-3">Standings</p>
                <StandingsTable rows={getGroupStandings(activeGroup)} />
              </div>
              <div>
                <p className="section-heading mb-3">Group Matches</p>
                {(() => {
                  const gMatches = getMatchesForGroup(activeGroup);
                  if (!gMatches.length) return (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-8 text-center">
                      <p className="text-slate-400 text-sm">No matches in this group yet</p>
                    </div>
                  );
                  const roundMap = new Map<number, TournamentMatch[]>();
                  gMatches.forEach(m => {
                    if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
                    roundMap.get(m.round_number)!.push(m);
                  });
                  const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);
                  return (
                    <div className="space-y-5">
                      {rounds.map(([rn, rMatches]) => {
                        const allDone = rMatches.every(m => m.winner_team_id);
                        return (
                          <div key={rn}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Round {rn}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${allDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}>
                                {allDone ? "Complete" : `${rMatches.filter(m => m.winner_team_id).length}/${rMatches.length} played`}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {rMatches.sort((a, b) => a.match_position - b.match_position).map(m => <MatchCard key={m.match_id} match={m} />)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {groupMatchesDone && !knockoutStarted && tournament.status !== "completed" && (
            <div className="sport-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border border-blue-400/20">
              <div>
                <p className="font-semibold text-sm text-slate-800 dark:text-white">All group matches complete!</p>
                <p className="text-xs text-slate-400 mt-0.5">Generate the knockout bracket with the top teams from each group.</p>
              </div>
              <button onClick={generateKnockout} disabled={generatingKnockout}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex-shrink-0">
                {generatingKnockout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                {generatingKnockout ? "Generating…" : "Generate Knockout →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SCORE UPDATE MODAL ── */}
      {selectedMatch && (() => {
        const t1 = getTeamById(selectedMatch.team1_id);
        const t2 = getTeamById(selectedMatch.team2_id);
        const t1Players = t1?.playersDetails ?? [];
        const t2Players = t2?.playersDetails ?? [];
        const needsSelection = t1Players.length > playersNeeded || t2Players.length > playersNeeded;
        const selectionValid = team1SelectedPlayers.length === playersNeeded && team2SelectedPlayers.length === playersNeeded;
        const canSubmit = !needsSelection || selectionValid;

        const PlayerPicker = ({ players, selected, side }: { players: { user_id: string; name: string }[]; selected: string[]; side: 1 | 2 }) => (
          <div className="space-y-1.5">
            {players.map(p => {
              const isSelected = selected.includes(p.user_id);
              const isDisabled = !isSelected && selected.length >= playersNeeded;
              return (
                <label key={p.user_id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${isSelected ? "bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40" : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/8 hover:border-blue-200 dark:hover:border-blue-500/30"} ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                  <input type={playersNeeded === 1 ? "radio" : "checkbox"} name={`team${side}player`} checked={isSelected} disabled={isDisabled} onChange={() => toggleTeamPlayer(side, p.user_id)} className="accent-blue-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 ml-auto flex-shrink-0" />}
                </label>
              );
            })}
          </div>
        );

        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="sport-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600" />
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-slate-800 dark:text-white">Update Score</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedMatch.match_stage}</p>
                  </div>
                  <button onClick={closeUpdateScore} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {needsSelection && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                      Who is playing? — select {playersNeeded} per team
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">{t1?.team_name ?? "Team 1"}</p>
                        <PlayerPicker players={t1Players} selected={team1SelectedPlayers} side={1} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-teal-500 uppercase tracking-wide mb-2">{t2?.team_name ?? "Team 2"}</p>
                        <PlayerPicker players={t2Players} selected={team2SelectedPlayers} side={2} />
                      </div>
                    </div>
                    {!selectionValid && <p className="text-xs text-rose-400 mt-2">Select exactly {playersNeeded} player{playersNeeded > 1 ? "s" : ""} from each team.</p>}
                  </div>
                )}

                {!needsSelection && (
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                      <p className="text-xs font-bold text-blue-500 mb-1.5">{t1?.team_name}</p>
                      {t1Players.map(p => <p key={p.user_id} className="text-sm text-slate-700 dark:text-slate-200">{p.name}</p>)}
                    </div>
                    <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20">
                      <p className="text-xs font-bold text-teal-500 mb-1.5">{t2?.team_name}</p>
                      {t2Players.map(p => <p key={p.user_id} className="text-sm text-slate-700 dark:text-slate-200">{p.name}</p>)}
                    </div>
                  </div>
                )}

                <div className="mb-5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    Score <span className="normal-case font-normal text-slate-400">· e.g. 21-19, 15-21, 21-18</span>
                  </label>
                  <input type="text" value={scoreInput} onChange={e => setScoreInput(e.target.value)} placeholder="21-19, 15-21, 21-18"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm font-mono" />
                  <p className="text-xs text-slate-400 mt-1.5">Separate games with commas. {t1?.team_name ?? "Team 1"} score listed first.</p>
                </div>

                <div className="flex gap-2">
                  <button onClick={closeUpdateScore} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                  <button onClick={updateMatchScore} disabled={updatingScore || !canSubmit}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {updatingScore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {updatingScore ? "Saving…" : "Save Score"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function TournamentDetails() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading tournament…</p>
      </div>
    }>
      <TournamentDetailsContent />
    </Suspense>
  );
}