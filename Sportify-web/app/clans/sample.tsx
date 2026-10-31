"use client";

import React, { useEffect, useState } from "react";
import { Plus, UserPlus, Users, Trophy, Calendar, TrendingUp, Medal, X, Search, ChevronRight, Shield } from "lucide-react";
import Link from "next/link";
import ProtectedRoute from "../components/ProtectedRoute";
import { auth } from "@/lib/firebase";

type Clan = {
  clan_id: string;
  name: string;
  clan_rank: number;
};

const features = [
  { name: "Members", icon: Users, color: "text-blue-600 dark:text-blue-400" },
  { name: "Matches", icon: Calendar, color: "text-green-600 dark:text-green-400" },
  { name: "Ranking", icon: Trophy, color: "text-yellow-600 dark:text-yellow-400" },
  { name: "Tournaments", icon: Medal, color: "text-purple-600 dark:text-purple-400" },
  { name: "Progress", icon: TrendingUp, color: "text-teal-600 dark:text-teal-400" },
];

const Clans = () => {
  const [userClans, setUserClans] = useState<Clan[]>([]);
  const [allClans, setAllClans] = useState<Clan[]>([]);

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [clanName, setClanName] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  const fetchUserClans = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const response = await fetch(`/api/clans/get_user_clan?userId=${user.uid}`);
      const data = await response.json();
      setUserClans(data);
    } catch (error) {
      console.error("Error fetching clans:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserClans();
  }, []);

  const handleCreateClan = async () => {
    if (!clanName.trim()) return;
    setCreating(true);
    const user = auth.currentUser;
    
    if (!user) return;
    try {
      const payload = { name: clanName, userId: user.uid };
      const response = await fetch("/api/clans/create_clan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to create clan");
      await fetchUserClans();
      setClanName("");
      setShowModal(false);
    } catch (error) {
      console.error("Error creating clan:", error);
    } finally {
      setCreating(false);
    }
  };

  const fetchAllClans = async () => {
    try {
      const response = await fetch("/api/clans/get_all_clans");
      const data = await response.json();
      setAllClans(data);
    } catch (error) {
      console.error("Error fetching all clans:", error);
    }
  };

  const handleJoinClan = async (clanId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    setJoining(clanId);
    try {
      const response = await fetch("/api/clans/join_clan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid, clanId }),
      });
      if (!response.ok) throw new Error("Failed to join clan");
      
      // Refresh user clans after joining
      await fetchUserClans();
      setShowJoinModal(false);
    } catch (error) {
      console.error("Error joining clan:", error);
    } finally {
      setJoining(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-6">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500 mb-2">
            Sportify Clans
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Create or join clans to compete together</p>
        </div>
        
        {/* Action Buttons */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden mb-8">
          <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500"></div>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Clan Management</h2>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center px-4 py-3 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg shadow transition"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create New Clan
              </button>
              <button 
                onClick={() => { setShowJoinModal(true); fetchAllClans(); }} 
                className="flex items-center px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-650 shadow-sm transition"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Join Existing Clan
              </button>
            </div>
          </div>
        </div>
        
        {/* My Clans Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500"></div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">My Clans</h2>
              <Link href="/tournaments" className="text-sm flex items-center text-blue-600 dark:text-blue-400 hover:underline">
                View tournaments
                <ChevronRight className="ml-1" size={16} />
              </Link>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"></div>
              </div>
            ) : userClans.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center">
                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">You are not part of any clans yet.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-green-500 text-white font-medium rounded-lg shadow transition"
                >
                  Create your first clan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userClans.map((clan) => (
                  <Link
                    href={`/clan/clandetails?clanId=${clan.clan_id}`}
                    key={clan.clan_id}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600 overflow-hidden hover:shadow-md transition"
                  >
                    <div className="h-40 relative bg-gradient-to-r from-blue-600 to-green-500">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 text-white">
                        <h3 className="text-xl font-semibold">{clan.name}</h3>
                        <div className="flex items-center space-x-1">
                          <Trophy className="w-4 h-4" />
                          <p className="text-sm">Global Rank #{clan.clan_rank}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="grid grid-cols-3 gap-2">
                        {features.slice(0, 3).map((feature) => (
                          <div key={feature.name} className="text-center p-2 rounded-lg">
                            <feature.icon className={`w-5 h-5 mx-auto ${feature.color}`} />
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{feature.name}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">View details</span>
                        <ChevronRight size={16} className="text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Create Clan Modal */}
        {showModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden w-full max-w-md border border-gray-100 dark:border-gray-700">
              <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500"></div>
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Create New Clan</h2>
                  <button 
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                  >
                    <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
                
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clan Name</label>
                  <input
                    type="text"
                    value={clanName}
                    onChange={(e) => setClanName(e.target.value)}
                    placeholder="Enter a unique clan name"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                
                <button
                  onClick={handleCreateClan}
                  disabled={creating || !clanName.trim()}
                  className="w-full flex justify-center items-center p-3 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg shadow transition disabled:opacity-70"
                >
                  {creating ? (
                    <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                  ) : (
                    <Plus className="mr-2" size={20} />
                  )}
                  {creating ? "Creating Clan..." : "Create Clan"}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Join Clan Modal - IMPROVED SCROLLING */}
        {showJoinModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-gray-700 max-h-[80vh] flex flex-col">
              <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500 flex-shrink-0"></div>
              <div className="p-6 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Join a Clan</h2>
                  <button 
                    onClick={() => setShowJoinModal(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                  >
                    <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
              </div>
              
              <div className="px-6 mb-4 flex-shrink-0">
                <div className="flex items-center bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <Search className="w-5 h-5 mx-3 text-gray-500 dark:text-gray-400" />
                  <input 
                    type="text" 
                    className="w-full p-3 bg-transparent outline-none text-gray-700 dark:text-white" 
                    placeholder="Search for clans..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                  />
                </div>
              </div>
              
              <div className="px-6 pb-6 overflow-y-auto flex-grow">
                <ul className="space-y-3">
                  {allClans.filter(clan => 
                    clan.name.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(clan => (
                    <li 
                      key={clan.clan_id} 
                      className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-lg hover:shadow-md transition"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gradient-to-r from-blue-600 to-green-500 rounded-full">
                          <Shield className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <span className="font-medium text-gray-800 dark:text-white">{clan.name}</span>
                          <div className="flex items-center space-x-1">
                            <Trophy className="w-3 h-3 text-yellow-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Rank #{clan.clan_rank}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleJoinClan(clan.clan_id)} 
                        disabled={joining === clan.clan_id}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white text-sm font-medium rounded-lg disabled:opacity-70 transition"
                      >
                        {joining === clan.clan_id ? (
                          <div className="w-4 h-4 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
                        ) : "Join"}
                      </button>
                    </li>
                  ))}
                  {allClans.filter(clan => 
                    clan.name.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length === 0 && (
                    <li className="text-center py-12 text-gray-500 dark:text-gray-400">
                      No clans found matching your search
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {/* Decorative Elements */}
        <div className="fixed top-12 left-12 w-32 h-32 bg-blue-300 dark:bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="fixed bottom-12 right-12 w-32 h-32 bg-green-300 dark:bg-green-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      </div>
    </ProtectedRoute>
  );
};

export default Clans