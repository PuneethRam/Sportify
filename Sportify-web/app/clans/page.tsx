"use client";

import { useEffect, useState } from "react";
import {
  Plus, UserPlus, Users, Trophy, Calendar, X,
  Search, ChevronRight, Shield, Star,
} from "lucide-react";
import Link from "next/link";
import ProtectedRoute from "../components/ProtectedRoute";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Clan = { clan_id: string; name: string; clan_rank: number };

const clanFeatures = [
  { name: "Members", icon: Users,    color: "text-blue-400" },
  { name: "Matches", icon: Calendar, color: "text-emerald-400" },
  { name: "Ranking", icon: Trophy,   color: "text-amber-400" },
];

function Modal({ open, onClose, accentClass, children }: {
  open: boolean; onClose: () => void; accentClass?: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
      <div className="sport-card w-full max-w-md">
        <div className={`h-0.5 ${accentClass || "bg-blue-600"}`} />
        <div className="p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

const Clans = () => {
  const [userClans,       setUserClans]       = useState<Clan[]>([]);
  const [allClans,        setAllClans]        = useState<Clan[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [showCreateClan,  setShowCreateClan]  = useState(false);
  const [showJoin,        setShowJoin]        = useState(false);
  const [clanName,        setClanName]        = useState("");
  const [creating,        setCreating]        = useState(false);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [joining,         setJoining]         = useState<string | null>(null);

  const fetchUserClans = async () => {
    const user = auth.currentUser; if (!user) return;
    try {
      const res  = await fetchWithAuth(`/api/clans/get_user_clan`);
      const data = await res.json();
      setUserClans(Array.isArray(data) ? data.filter((c: Clan & { type?: string }) => !c.type || c.type === "group") : []);
    } finally { setLoading(false); }
  };

  const fetchAllClans = async () => {
    try {
      const res  = await fetchWithAuth("/api/clans/get_all_clans");
      const data = await res.json();
      setAllClans(Array.isArray(data) ? data.filter((c: Clan & { type?: string }) => !c.type || c.type === "group") : []);
    } catch { /* ignore */ }
  };

  const handleCreateClan = async () => {
    if (!clanName.trim()) return; setCreating(true);
    const user = auth.currentUser; if (!user) return;
    try {
      await fetchWithAuth("/api/clans/create_clan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clanName }),
      });
      await fetchUserClans(); setClanName(""); setShowCreateClan(false);
    } finally { setCreating(false); }
  };

  const handleJoinClan = async (clanId: string) => {
    const user = auth.currentUser; if (!user) return; setJoining(clanId);
    try {
      await fetchWithAuth("/api/clans/join_clan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId }),
      });
      await fetchUserClans(); setShowJoin(false);
    } finally { setJoining(null); }
  };

  useEffect(() => { fetchUserClans(); }, []);

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white">Clans</h1>
            <p className="text-xs text-slate-400 mt-0.5">Compete with your friend groups</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowJoin(true); fetchAllClans(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <UserPlus className="w-4 h-4 text-blue-400" /> Join
            </button>
            <button onClick={() => setShowCreateClan(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm">
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>
        </div>

        {/* Clan list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : userClans.length === 0 ? (
          <div className="sport-card p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">No clans yet</p>
            <p className="text-sm text-slate-400 mb-5">Create a clan or join one to start competing with friends.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowCreateClan(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">
                Create Clan
              </button>
              <button onClick={() => { setShowJoin(true); fetchAllClans(); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                Join a Clan
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userClans.map(clan => (
              <Link href={`/clan/clandetails?clanId=${clan.clan_id}`} key={clan.clan_id}
                className="group sport-card-hover overflow-hidden">
                {/* Dark court banner */}
                <div className="h-24 relative bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
                  <div className="absolute inset-0 court-bg opacity-70" />
                  <div className="absolute -top-4 -right-4 w-20 h-20 bg-blue-500 rounded-full mix-blend-screen filter blur-2xl opacity-15 group-hover:opacity-25 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-teal-600 flex items-center justify-center text-white font-bold text-xs">
                      {clan.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{clan.name}</h3>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        <span className="text-xs text-slate-300">Rank #{clan.clan_rank}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Features strip */}
                <div className="p-3">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {clanFeatures.map(f => (
                      <div key={f.name} className="text-center p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <f.icon className={`w-4 h-4 mx-auto ${f.color}`} />
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{f.name}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-medium text-blue-500 dark:text-blue-400">View details</span>
                    <ChevronRight className="w-4 h-4 text-blue-500 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Clan Modal */}
        <Modal open={showCreateClan} onClose={() => setShowCreateClan(false)} accentClass="bg-blue-600">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-blue-400/10 border border-blue-400/20 rounded-xl">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="font-bold text-slate-800 dark:text-white">Create New Clan</h2>
          </div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Clan Name</label>
          <input type="text" value={clanName} onChange={e => setClanName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreateClan()}
            placeholder="Enter a unique clan name"
            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          />
          <button onClick={handleCreateClan} disabled={creating || !clanName.trim()}
            className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50">
            {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? "Creating…" : "Create Clan"}
          </button>
        </Modal>

        {/* Join Clan Modal */}
        <Modal open={showJoin} onClose={() => setShowJoin(false)}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-400/10 border border-blue-400/20 rounded-xl">
              <UserPlus className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="font-bold text-slate-800 dark:text-white">Join a Clan</h2>
          </div>
          <div className="flex items-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden mb-4">
            <Search className="w-4 h-4 mx-3 text-slate-400 flex-shrink-0" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search clans…"
              className="flex-1 py-2.5 pr-3 bg-transparent outline-none text-sm text-slate-700 dark:text-white placeholder-slate-400"
            />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allClans.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(clan => (
              <div key={clan.clan_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/8">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-teal-600 flex items-center justify-center text-white font-bold text-xs">
                    {clan.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-800 dark:text-white">{clan.name}</p>
                    <div className="flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-amber-400" />
                      <span className="text-xs text-slate-400">Rank #{clan.clan_rank}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => handleJoinClan(clan.clan_id)} disabled={joining === clan.clan_id}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                  {joining === clan.clan_id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Join"}
                </button>
              </div>
            ))}
            {allClans.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">No clans found</p>
            )}
          </div>
        </Modal>
      </div>
    </ProtectedRoute>
  );
};

export default Clans;
