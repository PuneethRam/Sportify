"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

interface ClanMember {
  user_id: string;
  name: string;
}

interface Match {
  match_id: number;
  team1Score: number;
  team2Score: number;
  scoreDetails: {
    score: string;
    team1Players: string[];
    team2Players: string[];
  };
  match_date: string;
  winner: string;
}

interface Series {
  series_id: number;
  clan_id: number;
  series_type: "singles" | "doubles";
  team1_name: string;
  team2_name: string;
  total_matches: number;
  winner_team: string | null;
  start_date: string;
  end_date: string | null;
  Team1_players: ClanMember[];
  Team2_players: ClanMember[];
}

// Create a wrapper component that uses useSearchParams
function SeriesDetailsContent() {
  const searchParams = useSearchParams();
  const clanId = searchParams.get("clanId");
  const seriesId = searchParams.get("seriesId");
  
  const [activeTab, setActiveTab] = useState<"squads" | "matches" | "play">("squads");
  const [series, setSeries] = useState<Series | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [duoPairsTeam1, setDuoPairsTeam1] = useState<string[]>([]);
  const [duoPairsTeam2, setDuoPairsTeam2] = useState<string[]>([]);
  const [finishingSeriesLoading, setFinishingSeriesLoading] = useState(false);
  
  // New match form state
  const [newMatch, setNewMatch] = useState({
    team1Players: [] as string[],
    team2Players: [] as string[],
    score: ""
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch series details and matches
  useEffect(() => {
    const fetchSeriesData = async () => {
      try {
        setLoading(true);
        const response = await fetchWithAuth(`/api/clans/series/get_series_details?clanId=${clanId}&seriesId=${seriesId}`);
        const data = await response.json();
        
        if (data.success) {
          setSeries(data.series);
          setMatches(data.matches || []);
          
          // Initialize new match form with the right number of player slots
          if (data.series.series_type === "singles") {
            setNewMatch({
              team1Players: [''],
              team2Players: [''],
              score: ""
            });
          } else {
            setNewMatch({
              team1Players: ['', ''],
              team2Players: ['', ''],
              score: ""
            });
          }
          
          // Calculate duo pairs
          if (data.series.series_type === "doubles") {
            setDuoPairsTeam1(calculateDuoPairs(data.series.Team1_players));
            setDuoPairsTeam2(calculateDuoPairs(data.series.Team2_players));
          }
        } else {
          console.error("Failed to load series:", data.error || "Unknown error");
        }
      } catch (error) {
        console.error("Error fetching series data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (clanId && seriesId) {
      fetchSeriesData();
    }
  }, [clanId, seriesId]);

  // Calculate duo pairs combinations
  const calculateDuoPairs = (players: ClanMember[]): string[] => {
    const pairs: string[] = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        pairs.push(`${players[i].name} & ${players[j].name}`);
      }
    }
    return pairs;
  };

  // Handle player selection for a new match
  const updateMatchPlayers = (team: "team1" | "team2", playerIndex: number, playerId: string) => {
    const updatedMatch = { ...newMatch };
    
    if (team === "team1") {
      const teamPlayers = [...updatedMatch.team1Players];
      teamPlayers[playerIndex] = playerId;
      updatedMatch.team1Players = teamPlayers;
    } else {
      const teamPlayers = [...updatedMatch.team2Players];
      teamPlayers[playerIndex] = playerId;
      updatedMatch.team2Players = teamPlayers;
    }
    
    setNewMatch(updatedMatch);
  };

  // Submit a new match
const submitMatch = async () => {
  // Validate score
  if (!newMatch.score) {
    alert("Please enter a valid score");
    return;
  }
  
  // Validate player selections
  if (series?.series_type === "singles") {
    if (!newMatch.team1Players[0] || !newMatch.team2Players[0]) {
      alert("Please select players for both teams");
      return;
    }
  } else {
    if (!newMatch.team1Players[0] || !newMatch.team1Players[1] || 
        !newMatch.team2Players[0] || !newMatch.team2Players[1]) {
      alert("Please select all players for both teams");
      return;
    }
  }

  try {
    setSubmitting(true);
    
    let payload;
    
    if (series?.series_type === "singles") {
      payload = {
        matchType: "singles",
        clanId,
        series_id: seriesId,
        player1: newMatch.team1Players[0],
        player2: newMatch.team2Players[0],
        scoreDetails: {
          score: newMatch.score,
          team1Players: newMatch.team1Players,
          team2Players: newMatch.team2Players
        }
      };
    } else {
      payload = {
        matchType: "doubles",
        clanId,
        series_id: seriesId,
        team1Player1: newMatch.team1Players[0],
        team1Player2: newMatch.team1Players[1],
        team2Player1: newMatch.team2Players[0],
        team2Player2: newMatch.team2Players[1],
        scoreDetails: {
          score: newMatch.score,
          team1Players: newMatch.team1Players,
          team2Players: newMatch.team2Players
        }
      };
    }
    
    const response = await fetchWithAuth("/api/clans/update_match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Leaderboard is now updated atomically inside update_match — no separate call needed

      // Refresh match data
      const refreshResponse = await fetchWithAuth(`/api/clans/series/get_series_details?clanId=${clanId}&seriesId=${seriesId}`);
      const refreshData = await refreshResponse.json();
      
      if (refreshData.success) {
        setMatches(refreshData.matches || []);
        setSeries(refreshData.series);
        
        // Reset form
        setNewMatch({
          team1Players: series?.series_type === "singles" ? [''] : ['', ''],
          team2Players: series?.series_type === "singles" ? [''] : ['', ''],
          score: ""
        });
        
        alert("Match added successfully and leaderboard updated!");
      }
    } else {
      throw new Error(data.error || "Failed to add match");
    }
  } catch (error) {
    console.error("Error adding match:", error);
    alert("Failed to add match. Please try again.");
  } finally {
    setSubmitting(false);
  }
};
  // Finish series
  const finishSeries = async () => {
    if (!matches.length) {
      alert("You need to record at least one match before finishing the series");
      return;
    }

    const confirm = window.confirm("Are you sure you want to finish this series? This will determine the winner and cannot be undone.");
    if (!confirm) return;

    try {
      setFinishingSeriesLoading(true);
      
      // API call to finish the series
      const response = await fetchWithAuth("/api/clans/series/finish_series", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clanId,
          seriesId
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh series data
        const refreshResponse = await fetchWithAuth(`/api/clans/series/get_series_details?clanId=${clanId}&seriesId=${seriesId}`);
        const refreshData = await refreshResponse.json();
        
        if (refreshData.success) {
          setSeries(refreshData.series);
          alert("Series finished successfully!");
        }
      } else {
        throw new Error(data.error || "Failed to finish series");
      }
    } catch (error) {
      console.error("Error finishing series:", error);
      alert("Failed to finish series. Please try again.");
    } finally {
      setFinishingSeriesLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-lg">Loading series details...</p>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-lg text-red-600">Series not found or error loading data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{series.team1_name || "Team 1"} vs {series.team2_name || "Team 2"}</h1>
        <div className="flex items-center flex-wrap gap-2 text-gray-600 mb-4">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {series.series_type.charAt(0).toUpperCase() + series.series_type.slice(1)}
          </span>
          {series.total_matches > 0 && (
            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
              Best of {series.total_matches} · First to {Math.ceil(series.total_matches / 2)} wins
            </span>
          )}
          <span>Started: {new Date(series.start_date).toLocaleDateString()}</span>
          {series.end_date && (
            <span>Ended: {new Date(series.end_date).toLocaleDateString()}</span>
          )}
        </div>
        
        {/* Live standings scoreboard */}
        {(() => {
          const t1Wins = matches.filter(m => m.winner === "player1").length;
          const t2Wins = matches.filter(m => m.winner === "player2").length;
          const draws  = matches.filter(m => m.winner === "draw").length;
          const needed = series.total_matches > 0 ? Math.ceil(series.total_matches / 2) : null;
          const leadMsg = t1Wins === t2Wins
            ? (t1Wins === 0 ? null : `Tied · ${t1Wins}–${t2Wins}`)
            : t1Wins > t2Wins
              ? `${series.team1_name} leads · ${t1Wins}–${t2Wins}`
              : `${series.team2_name} leads · ${t2Wins}–${t1Wins}`;

          if (series.winner_team) {
            return (
              <div className="mb-6 bg-gradient-to-r from-yellow-300 to-yellow-500 p-6 rounded-lg shadow-md text-center">
                <div className="text-xl font-bold mb-2 text-yellow-900">🏆 SERIES COMPLETED 🏆</div>
                <div className="text-3xl font-extrabold mb-3 text-yellow-900">{series.winner_team}</div>
                <div className="text-lg font-semibold text-yellow-900">WINNER · Final score {t1Wins}–{t2Wins}{draws > 0 ? ` (${draws} draw${draws > 1 ? "s" : ""})` : ""}</div>
              </div>
            );
          }
          if (!matches.length) return null;
          return (
            <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
              <div className="flex items-stretch">
                <div className={`flex-1 flex flex-col items-center justify-center py-4 px-6 ${t1Wins > t2Wins ? "bg-blue-50 dark:bg-blue-900/30" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{series.team1_name}</span>
                  <span className={`text-4xl font-black ${t1Wins > t2Wins ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`}>{t1Wins}</span>
                  {needed && t1Wins >= needed && <span className="mt-1 text-xs font-bold text-blue-600 dark:text-blue-400">Match point</span>}
                </div>
                <div className="flex flex-col items-center justify-center px-5 border-x border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Score</span>
                  {draws > 0 && <span className="text-xs text-slate-400">{draws} draw{draws > 1 ? "s" : ""}</span>}
                  {leadMsg && <span className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">{leadMsg}</span>}
                  {needed && <span className="mt-1 text-xs text-slate-400">First to {needed}</span>}
                </div>
                <div className={`flex-1 flex flex-col items-center justify-center py-4 px-6 ${t2Wins > t1Wins ? "bg-red-50 dark:bg-red-900/30" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{series.team2_name}</span>
                  <span className={`text-4xl font-black ${t2Wins > t1Wins ? "text-red-600 dark:text-red-400" : "text-slate-400"}`}>{t2Wins}</span>
                  {needed && t2Wins >= needed && <span className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">Match point</span>}
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex flex-wrap text-center mb-2">
          <div className="px-4 py-2 w-1/2 md:w-1/3 bg-blue-500 text-white rounded-tl-md">
            {series.team1_name || "Team 1"}: {series.Team1_players.length} Players
          </div>
          <div className="px-4 py-2 w-1/2 md:w-1/3 bg-red-500 text-white rounded-tr-md">
            {series.team2_name || "Team 2"}: {series.Team2_players.length} Players
          </div>
        </div>
        
        <div className="mt-6">
          <div className="flex border-b">
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'squads' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-600'}`}
              onClick={() => setActiveTab('squads')}
            >
              Squads
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'matches' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-600'}`}
              onClick={() => setActiveTab('matches')}
            >
              Matches ({matches.length})
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'play' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-600'}`}
              onClick={() => setActiveTab('play')}
              disabled={!!series.winner_team}
            >
              Play
            </button>
          </div>
        </div>
      </div>
      
      {/* SQUADS TAB */}
      {activeTab === 'squads' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-4 rounded-md">
            <h2 className="text-xl font-semibold mb-4 text-blue-800">{series.team1_name || "Team 1"}</h2>
            
            <div className="mb-4">
              <h3 className="font-medium mb-2">Team Players:</h3>
              <div className="flex flex-wrap gap-2">
                {series.Team1_players.map(player => (
                  <div key={player.user_id} className="bg-blue-100 px-3 py-1 rounded-full">
                    {player.name}
                  </div>
                ))}
                {series.Team1_players.length === 0 && (
                  <span className="text-gray-500">No players assigned</span>
                )}
              </div>
            </div>
            
            {series.series_type === "doubles" && series.Team1_players.length > 1 && (
              <div>
                <h3 className="font-medium mb-2">Possible Duos ({duoPairsTeam1.length}):</h3>
                <div className="text-sm text-gray-600">
                  {duoPairsTeam1.map((pair, index) => (
                    <div key={index} className="mb-1">{pair}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-red-50 p-4 rounded-md">
            <h2 className="text-xl font-semibold mb-4 text-red-800">{series.team2_name || "Team 2"}</h2>
            
            <div className="mb-4">
              <h3 className="font-medium mb-2">Team Players:</h3>
              <div className="flex flex-wrap gap-2">
                {series.Team2_players.map(player => (
                  <div key={player.user_id} className="bg-red-100 px-3 py-1 rounded-full">
                    {player.name}
                  </div>
                ))}
                {series.Team2_players.length === 0 && (
                  <span className="text-gray-500">No players assigned</span>
                )}
              </div>
            </div>
            
            {series.series_type === "doubles" && series.Team2_players.length > 1 && (
              <div>
                <h3 className="font-medium mb-2">Possible Duos ({duoPairsTeam2.length}):</h3>
                <div className="text-sm text-gray-600">
                  {duoPairsTeam2.map((pair, index) => (
                    <div key={index} className="mb-1">{pair}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* MATCHES TAB */}
      {activeTab === 'matches' && (
        <div>
          {matches.length > 0 ? (
            <div>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border">Date</th>
                      <th className="py-2 px-4 border">Players</th>
                      <th className="py-2 px-4 border">Score</th>
                      <th className="py-2 px-4 border">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match, index) => (
                      <tr key={match.match_id || index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="py-2 px-4 border">
                          {new Date(match.match_date).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-4 border">
                          <div className="mb-1">
                            <span className="text-blue-600 font-medium">Team 1:</span>{' '}
                            {match.scoreDetails.team1Players.map((playerId, idx) => {
                              const player = series.Team1_players.find(p => p.user_id === playerId);
                              return player ? (idx > 0 ? ` & ${player.name}` : player.name) : 'Unknown';
                            })}
                          </div>
                          <div>
                            <span className="text-red-600 font-medium">Team 2:</span>{' '}
                            {match.scoreDetails.team2Players.map((playerId, idx) => {
                              const player = series.Team2_players.find(p => p.user_id === playerId);
                              return player ? (idx > 0 ? ` & ${player.name}` : player.name) : 'Unknown';
                            })}
                          </div>
                        </td>
                        <td className="py-2 px-4 border">
                          {match.scoreDetails.score}
                        </td>
                        <td className="py-2 px-4 border">
                          {match.winner === "player1" ? (
                            <span className="text-blue-600 font-medium">Team 1</span>
                          ) : match.winner === "player2" ? (
                            <span className="text-red-600 font-medium">Team 2</span>
                          ) : "Draw"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Finish Series Button */}
              {!series.winner_team && (
                <div className="mt-6 text-center">
                  <button 
                    onClick={finishSeries}
                    disabled={finishingSeriesLoading}
                    className="px-6 py-3 bg-yellow-500 text-white font-bold rounded-lg shadow-md hover:bg-yellow-600 transition duration-200 disabled:bg-gray-400"
                  >
                    {finishingSeriesLoading ? "Finishing Series..." : "Finish Series"}
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    Clicking this button will determine the winner and complete the series.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-md">
              <p className="text-gray-500">No matches recorded yet</p>
              <button 
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={() => setActiveTab('play')}
                disabled={!!series.winner_team}
              >
                Add Match
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* PLAY TAB */}
      {activeTab === 'play' && !series.winner_team && (
        <div className="border rounded-md p-6">
          <h2 className="text-xl font-semibold mb-6">Record New Match</h2>
          
          {series.series_type === "singles" ? (
            <div className="space-y-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 mb-2">
                    Team 1 Player
                  </label>
                  <select
                    className="w-full px-4 py-2 border rounded-md bg-white text-gray-800"
                    value={newMatch.team1Players[0] || ""}
                    onChange={(e) => updateMatchPlayers("team1", 0, e.target.value)}
                    required
                  >
                    <option value="">Select Player</option>
                    {series.Team1_players.map((member) => (
                      <option key={`p1-${member.user_id}`} value={member.user_id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 mb-2">
                    Team 2 Player
                  </label>
                  <select
                    className="w-full px-4 py-2 border rounded-md bg-white text-gray-800"
                    value={newMatch.team2Players[0] || ""}
                    onChange={(e) => updateMatchPlayers("team2", 0, e.target.value)}
                    required
                  >
                    <option value="">Select Player</option>
                    {series.Team2_players.map((member) => (
                      <option key={`p2-${member.user_id}`} value={member.user_id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-md">
                  <h3 className="text-lg font-medium text-blue-800 mb-3">
                    Team 1
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 mb-1">
                        Player 1
                      </label>
                      <select
                        className="w-full px-3 py-2 border rounded-md bg-white text-gray-800"
                        value={newMatch.team1Players[0] || ""}
                        onChange={(e) => updateMatchPlayers("team1", 0, e.target.value)}
                        required
                      >
                        <option value="">Select Player</option>
                        {series.Team1_players.map((member) => (
                          <option key={`t1p1-${member.user_id}`} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-1">
                        Player 2
                      </label>
                      <select
                        className="w-full px-3 py-2 border rounded-md bg-white text-gray-800"
                        value={newMatch.team1Players[1] || ""}
                        onChange={(e) => updateMatchPlayers("team1", 1, e.target.value)}
                        required
                      >
                        <option value="">Select Player</option>
                        {series.Team1_players.map((member) => (
                          <option key={`t1p2-${member.user_id}`} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 p-4 rounded-md">
                  <h3 className="text-lg font-medium text-red-800 mb-3">
                    Team 2
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-700 mb-1">
                        Player 1
                      </label>
                      <select
                        className="w-full px-3 py-2 border rounded-md bg-white text-gray-800"
                        value={newMatch.team2Players[0] || ""}
                        onChange={(e) => updateMatchPlayers("team2", 0, e.target.value)}
                        required
                      >
                        <option value="">Select Player</option>
                        {series.Team2_players.map((member) => (
                          <option key={`t2p1-${member.user_id}`} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-1">
                        Player 2
                      </label>
                      <select
                        className="w-full px-3 py-2 border rounded-md bg-white text-gray-800"
                        value={newMatch.team2Players[1] || ""}
                        onChange={(e) => updateMatchPlayers("team2", 1, e.target.value)}
                        required
                      >
                        <option value="">Select Player</option>
                        {series.Team2_players.map((member) => (
                          <option key={`t2p2-${member.user_id}`} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Score Entry */}
          <div className="mt-6">
            <label className="block text-gray-700 mb-2">
              Match Score
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border rounded-md bg-white text-gray-800"
              placeholder="e.g. 21-19, 15-21, 21-18"
              value={newMatch.score}
              onChange={(e) => setNewMatch({...newMatch, score: e.target.value})}
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter the full match score (e.g. 21-19, 15-21, 21-18)
            </p>
          </div>

          <div className="mt-8">
            <button
              onClick={submitMatch}
              disabled={submitting}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {submitting ? "Submitting..." : "Record Match"}
            </button>
          </div>
        </div>
      )}
      
      {/* Show message when series is finished and play tab is active */}
      {activeTab === 'play' && series.winner_team && (
        <div className="border rounded-md p-6 text-center">
          <div className="text-2xl mb-3">🏆 Series Completed 🏆</div>
          <p className="text-lg mb-4">This series has been completed and the winner is:</p>
          <div className="text-2xl font-bold p-4 mb-4 bg-yellow-100 text-yellow-800 rounded-lg">
            {series.winner_team}
          </div>
          <p>No more matches can be added to this series.</p>
          <button 
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => setActiveTab('matches')}
          >
            View Match History
          </button>
        </div>
      )}
    </div>
  );
}

// Main component with Suspense boundary
export default function SeriesDetails() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-lg">Loading series details...</p>
        </div>
      </div>
    }>
      <SeriesDetailsContent />
    </Suspense>
  );
}