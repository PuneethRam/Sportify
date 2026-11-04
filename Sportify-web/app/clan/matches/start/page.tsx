"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { track } from "@/lib/track";

interface Player {
  user_id: string;
  name: string;
}

// Create a separate component that uses useSearchParams
function MatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clanId = searchParams.get('clanId');
  
  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");
  const [clanMembers, setClanMembers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form states - using strings for select values
  const [player1, setPlayer1] = useState<string>("");
  const [player2, setPlayer2] = useState<string>("");
  const [team1Player1, setTeam1Player1] = useState<string>("");
  const [team1Player2, setTeam1Player2] = useState<string>("");
  const [team2Player1, setTeam2Player1] = useState<string>("");
  const [team2Player2, setTeam2Player2] = useState<string>("");
  const [score, setScore] = useState<string>("");
  
  // Get clan members on component mount
  useEffect(() => {
    const fetchClanMembers = async () => {
      if (!clanId) return;
      
      setLoading(true);
      try {
        // Fetch clan members
        const response = await fetchWithAuth(`/api/clans/get_clanmembers?clanId=${clanId}`);
        if (!response.ok) throw new Error("Failed to fetch clan members");
        
        const data = await response.json();
        setClanMembers(data.members || []);
      } catch (error) {
        console.error("Error fetching clan members:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClanMembers();
  }, [clanId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clanId) {
      alert("Clan ID is missing");
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Validate form data
      if (matchType === "singles") {
        if (player1 === player2) {
          alert("Please select different players");
          setSubmitting(false);
          return;
        }
        if (!player1 || !player2 || !score) {
          alert("Please fill all required fields");
          setSubmitting(false);
          return;
        }
      } else {
        // Check for duplicates in doubles teams
        const allPlayers = [team1Player1, team1Player2, team2Player1, team2Player2];
        const uniquePlayers = new Set(allPlayers.filter(p => p !== ""));
        if (uniquePlayers.size !== allPlayers.filter(p => p !== "").length) {
          alert("Please select different players for each position");
          setSubmitting(false);
          return;
        }
        if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2 || !score) {
          alert("Please fill all required fields");
          setSubmitting(false);
          return;
        }
      }

      // Prepare match data - pass the user_id values directly without parseInt
      const matchData = matchType === "singles" 
        ? {
            matchType: "singles",
            clanId: clanId, // Keep as string if your API expects string
            player1: player1, // Pass user_id directly as string
            player2: player2, // Pass user_id directly as string
            scoreDetails: { score }
          }
        : {
            matchType: "doubles",
            clanId: clanId,
            team1Player1: team1Player1,
            team1Player2: team1Player2,
            team2Player1: team2Player1,
            team2Player2: team2Player2,
            scoreDetails: { score }
          };

      console.log("Submitting match data:", matchData); // Debug log
      
      // Submit match data to API
      const response = await fetchWithAuth('/api/clans/update_match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(matchData),
      });

      if (!response.ok) {
        throw new Error("Failed to submit match data");
      }

      const result = await response.json();
      track("match_submitted", { match_type: matchData.matchType, status: result.status });
      alert(result.status === "pending"
        ? "Result submitted — it will count once the other side confirms it."
        : "Match recorded successfully!");
      
      // Redirect to matches list
      router.push(`/clan/matches?clanId=${clanId}`);
      
    } catch (error) {
      console.error("Error submitting match:", error);
      alert("Failed to record match. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Record New Match
        </h1>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          <div className="mb-6">
            <div className="flex justify-center space-x-4 mb-6">
              <button
                type="button"
                className={`px-4 py-2 rounded-md ${
                  matchType === "singles"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
                onClick={() => setMatchType("singles")}
              >
                Singles Match
              </button>
              <button
                type="button"
                className={`px-4 py-2 rounded-md ${
                  matchType === "doubles"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
                onClick={() => setMatchType("doubles")}
              >
                Doubles Match
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {matchType === "singles" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 mb-2">
                      Player 1
                    </label>
                    <select
                      className="w-full px-4 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      value={player1}
                      onChange={(e) => setPlayer1(e.target.value)}
                      required
                    >
                      <option value="">Select Player 1</option>
                      {clanMembers.map((member) => (
                        <option key={`p1-${member.user_id}`} value={member.user_id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 mb-2">
                      Player 2
                    </label>
                    <select
                      className="w-full px-4 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      value={player2}
                      onChange={(e) => setPlayer2(e.target.value)}
                      required
                    >
                      <option value="">Select Player 2</option>
                      {clanMembers.map((member) => (
                        <option key={`p2-${member.user_id}`} value={member.user_id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                      <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-3">
                        Team 1
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">
                            Player 1
                          </label>
                          <select
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                            value={team1Player1}
                            onChange={(e) => setTeam1Player1(e.target.value)}
                            required
                          >
                            <option value="">Select Player</option>
                            {clanMembers.map((member) => (
                              <option key={`t1p1-${member.user_id}`} value={member.user_id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">
                            Player 2
                          </label>
                          <select
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                            value={team1Player2}
                            onChange={(e) => setTeam1Player2(e.target.value)}
                            required
                          >
                            <option value="">Select Player</option>
                            {clanMembers.map((member) => (
                              <option key={`t1p2-${member.user_id}`} value={member.user_id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
                      <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-3">
                        Team 2
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">
                            Player 1
                          </label>
                          <select
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                            value={team2Player1}
                            onChange={(e) => setTeam2Player1(e.target.value)}
                            required
                          >
                            <option value="">Select Player</option>
                            {clanMembers.map((member) => (
                              <option key={`t2p1-${member.user_id}`} value={member.user_id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">
                            Player 2
                          </label>
                          <select
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                            value={team2Player2}
                            onChange={(e) => setTeam2Player2(e.target.value)}
                            required
                          >
                            <option value="">Select Player</option>
                            {clanMembers.map((member) => (
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

              <div className="mt-6">
                <label className="block text-gray-700 dark:text-gray-300 mb-2">
                  Match Score
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  placeholder="e.g. 21-19, 15-21, 21-18"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  required
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Enter the full match score (e.g. 21-19, 15-21, 21-18)
                </p>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Record Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading fallback component 
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
}

// Main component with Suspense boundary
export default function StartMatchContent() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MatchContent />
    </Suspense>
  );
}