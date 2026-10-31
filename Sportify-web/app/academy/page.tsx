"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  Building2, Plus, KeyRound, ChevronRight, Users, Loader2,
  X, Crown, BookOpen, Trophy,
} from "lucide-react";
import ProtectedRoute from "@/app/components/ProtectedRoute";

type Org = {
  org_id: number;
  name: string;
  created_at: string;
};

type Batch = {
  clan_id: number;
  name: string;
  type: string;
  org_id: number;
  org_name?: string;
  role?: string;
};

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
      <div className="sport-card w-full max-w-md">
        <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
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

function AcademyContent() {
  const router = useRouter();

  const [ownedOrgs,  setOwnedOrgs]  = useState<Org[]>([]);
  const [memberOrgs, setMemberOrgs] = useState<Org[]>([]);
  const [batches,    setBatches]    = useState<Batch[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [showCreate,    setShowCreate]    = useState(false);
  const [showJoin,      setShowJoin]      = useState(false);
  const [orgName,       setOrgName]       = useState("");
  const [inviteCode,    setInviteCode]    = useState("");
  const [creating,      setCreating]      = useState(false);
  const [joining,       setJoining]       = useState(false);
  const [joinError,     setJoinError]     = useState("");

  const load = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const [orgsRes, memberRes, clansRes] = await Promise.all([
        fetchWithAuth(`/api/organisations/get_user_orgs`),
        fetchWithAuth(`/api/organisations/get_member_orgs`),
        fetchWithAuth(`/api/clans/get_user_clan`),
      ]);
      const orgsData   = await orgsRes.json();
      const memberData = await memberRes.json();
      const clansData  = await clansRes.json();

      setOwnedOrgs(orgsData.data   || []);
      setMemberOrgs(memberData.data || []);
      setBatches(Array.isArray(clansData) ? clansData.filter((c: Batch) => c.type === "batch") : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!orgName.trim()) return;
    const user = auth.currentUser; if (!user) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth("/api/organisations/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await load();
      setOrgName(""); setShowCreate(false);
    } finally { setCreating(false); }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    const user = auth.currentUser; if (!user) return;
    setJoining(true); setJoinError("");
    try {
      const res  = await fetchWithAuth("/api/organisations/join_batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setJoinError(data.error || "Invalid code"); return; }
      await load();
      setInviteCode(""); setShowJoin(false);
    } finally { setJoining(false); }
  };

  const totalBatches   = ownedOrgs.length;
  const isEmpty        = ownedOrgs.length === 0 && memberOrgs.length === 0 && batches.length === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="display-font font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white">Academy</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage your training centres and batches</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => { setShowJoin(true); setJoinError(""); setInviteCode(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <KeyRound className="w-4 h-4 text-emerald-400" /> Join
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors shadow">
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      ) : isEmpty ? (
        /* ── Empty state ── */
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="font-bold text-slate-700 dark:text-slate-200 text-lg mb-1">No academies yet</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
              Create your training centre to manage batches, attendance, and student progress — or join one with an invite code.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
                <Plus className="w-4 h-4" /> Create Academy
              </button>
              <button onClick={() => { setShowJoin(true); setJoinError(""); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <KeyRound className="w-4 h-4 text-emerald-400" /> Join via Code
              </button>
            </div>
          </div>

          {/* Feature hint cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Users,    color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Batches",    sub: "Organise players into groups" },
              { icon: BookOpen, color: "text-amber-400",   bg: "bg-amber-500/10",   label: "Attendance", sub: "Track who shows up" },
              { icon: Trophy,   color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Reports",    sub: "Share student progress" },
            ].map(({ icon: Icon, color, bg, label, sub }) => (
              <div key={label} className="sport-card p-4 text-center">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <p className="font-semibold text-xs text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Owned Academies ── */}
          {ownedOrgs.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <h2 className="section-heading">Your Academies · {ownedOrgs.length}</h2>
              </div>
              <div className="space-y-3">
                {ownedOrgs.map(org => (
                  <div key={org.org_id}
                    onClick={() => router.push(`/org/${org.org_id}`)}
                    className="group sport-card overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all duration-200">
                    <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="p-4 flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow flex-shrink-0">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="display-font font-bold text-slate-800 dark:text-white text-lg leading-tight">{org.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Owner · Training Centre</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          Manage <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Member Academies / Enrolled Batches ── */}
          {(memberOrgs.length > 0 || batches.length > 0) && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <h2 className="section-heading">Enrolled</h2>
              </div>

              {/* Orgs user is a member of (coach/member) */}
              {memberOrgs.map(org => (
                <div key={org.org_id}
                  onClick={() => router.push(`/org/${org.org_id}`)}
                  className="group sport-card overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all duration-200 mb-3">
                  <div className="h-0.5 bg-gradient-to-r from-blue-400 to-teal-500" />
                  <div className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-400/20 flex-shrink-0">
                      <Building2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 dark:text-white">{org.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Coach / Staff</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                  </div>
                </div>
              ))}

              {/* Batches user is enrolled in */}
              {batches.length > 0 && (
                <div className="sport-card overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-teal-400 to-cyan-500" />
                  <div className="p-2">
                    {batches.map(batch => (
                      <button key={batch.clan_id}
                        onClick={() => router.push(`/clan/clandetails?clanId=${batch.clan_id}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/4 transition-colors text-left">
                        <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-400/20 flex-shrink-0">
                          <Users className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 dark:text-white">{batch.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">My Batch</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── Create Academy Modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl">
            <Building2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white">Create Academy</h2>
            <p className="text-xs text-slate-400 mt-0.5">You'll be the owner and can invite coaches</p>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Academy Name</label>
        <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder="e.g. Smash Badminton Academy"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 mb-5"
        />
        <button onClick={handleCreate} disabled={creating || !orgName.trim()}
          className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors disabled:opacity-50">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? "Creating…" : "Create Academy"}
        </button>
      </Modal>

      {/* ── Join Batch Modal ── */}
      <Modal open={showJoin} onClose={() => setShowJoin(false)}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-teal-400/10 border border-teal-400/20 rounded-xl">
            <KeyRound className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white">Join a Batch</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enter the invite code your coach gave you</p>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Invite Code</label>
        <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleJoin()}
          placeholder="e.g. ABC123"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 font-mono tracking-widest text-lg mb-2"
        />
        {joinError && <p className="text-xs text-rose-400 mb-3">{joinError}</p>}
        <p className="text-xs text-slate-400 mb-5">Ask your coach to share their batch's invite code from the Academy page.</p>
        <button onClick={handleJoin} disabled={joining || !inviteCode.trim()}
          className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold transition-colors disabled:opacity-50">
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {joining ? "Joining…" : "Join Batch"}
        </button>
      </Modal>
    </div>
  );
}

export default function AcademyPage() {
  return (
    <ProtectedRoute>
      <AcademyContent />
    </ProtectedRoute>
  );
}
