"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import ShareInviteButton from "@/app/components/ShareInviteButton";
import {
  Building2, Plus, Users, Copy, RefreshCw, ChevronRight,
  X, Check, ArrowLeft, Loader2, Calendar, Bell, Pin,
  Trash2, Crown,
} from "lucide-react";

type Batch = {
  clan_id: number;
  name: string;
  invite_code: string;
  member_count: number;
};

type Organisation = {
  org_id: number;
  name: string;
  owner_user_id: string;
  created_at: string;
};

type Membership = {
  clan_id: number;
  batch_name: string;
  role: string;
};

type Session = {
  session_id: number;
  org_id: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
  created_by: string | null;
};

type Announcement = {
  announcement_id: number;
  org_id: number;
  author_id: string;
  author_name: string | null;
  title: string;
  body: string;
  pinned: number;
  created_at: string;
};

type Tab = "batches" | "schedule" | "announcements";

function localDatetimeStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Modal({
  open, onClose, accentClass, children,
}: {
  open: boolean; onClose: () => void; accentClass?: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
      <div className="sport-card w-full max-w-md">
        <div className={`h-0.5 ${accentClass ?? "bg-emerald-500"}`} />
        <div className="p-6 relative">
          <button onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

const DURATION_OPTS = [30, 60, 90, 120];

export default function OrgPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();

  // ── context ──
  const [org, setOrg] = useState<Organisation | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  // ── tab ──
  const [tab, setTab] = useState<Tab>("batches");

  // ── owner: create batch ──
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  // ── schedule ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessTitle, setSessTitle] = useState("");
  const [sessDate, setSessDate] = useState(localDatetimeStr(new Date()));
  const [sessDur, setSessDur] = useState(60);
  const [sessNotes, setSessNotes] = useState("");
  const [addingSession, setAddingSession] = useState(false);

  // ── announcements ──
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnn, setLoadingAnn] = useState(false);
  const [showAddAnn, setShowAddAnn] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annPin, setAnnPin] = useState(false);
  const [postingAnn, setPostingAnn] = useState(false);

  // ── fetch org context ──
  const fetchContext = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !orgId) return;
    try {
      const res  = await fetchWithAuth(`/api/organisations/org_context?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        router.push("/clans");
        return;
      }
      setOrg(data.org);
      setBatches(data.batches);
      setIsOwner(data.isOwner);
      setIsStaff(data.isStaff);
      setMembership(data.userMembership);

      if (!data.isOwner && !data.userMembership) {
        router.push("/clans");
      }
    } catch {
      router.push("/clans");
    } finally {
      setLoading(false);
    }
  }, [orgId, router]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  // ── fetch sessions ──
  const fetchSessions = useCallback(async () => {
    if (!orgId) return;
    setLoadingSessions(true);
    try {
      const res  = await fetchWithAuth(`/api/organisations/org_sessions?orgId=${orgId}`);
      const data = await res.json();
      if (data.success) setSessions(data.data as Session[]);
    } finally {
      setLoadingSessions(false);
    }
  }, [orgId]);

  // ── fetch announcements ──
  const fetchAnnouncements = useCallback(async () => {
    if (!orgId) return;
    setLoadingAnn(true);
    try {
      const res  = await fetchWithAuth(`/api/organisations/org_announcements?orgId=${orgId}`);
      const data = await res.json();
      if (data.success) setAnnouncements(data.data as Announcement[]);
    } finally {
      setLoadingAnn(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (tab === "schedule")       fetchSessions();
    if (tab === "announcements")  fetchAnnouncements();
  }, [tab, fetchSessions, fetchAnnouncements]);

  // ── owner actions ──
  const handleCreateBatch = async () => {
    if (!batchName.trim()) return;
    const user = auth.currentUser; if (!user) return;
    setCreating(true);
    try {
      await fetchWithAuth("/api/organisations/create_batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: batchName }),
      });
      await fetchContext();
      setBatchName(""); setShowCreateBatch(false);
    } finally { setCreating(false); }
  };

  const handleCopyCode = (batchId: number, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(batchId);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRegenerateCode = async (batchId: number) => {
    const user = auth.currentUser; if (!user) return;
    setRegenerating(batchId);
    try {
      await fetchWithAuth("/api/organisations/generate_invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      await fetchContext();
    } finally { setRegenerating(null); }
  };

  // ── session actions ──
  const handleAddSession = async () => {
    const user = auth.currentUser; if (!user) return;
    setAddingSession(true);
    try {
      await fetchWithAuth("/api/organisations/org_sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          title: sessTitle || "Training Session",
          scheduledAt: sessDate.replace("T", " ") + ":00",
          durationMinutes: sessDur,
          notes: sessNotes || null,
        }),
      });
      await fetchSessions();
      setSessTitle(""); setSessNotes(""); setSessDur(60);
      setSessDate(localDatetimeStr(new Date()));
      setShowAddSession(false);
    } finally { setAddingSession(false); }
  };

  const handleDeleteSession = async (sessionId: number) => {
    await fetchWithAuth(`/api/organisations/org_sessions?sessionId=${sessionId}`, { method: "DELETE" });
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
  };

  // ── announcement actions ──
  const handlePostAnn = async () => {
    const user = auth.currentUser; if (!user) return;
    setPostingAnn(true);
    try {
      await fetchWithAuth("/api/organisations/org_announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          authorName: user.displayName || user.email || "Coach",
          title: annTitle, body: annBody, pinned: annPin,
        }),
      });
      await fetchAnnouncements();
      setAnnTitle(""); setAnnBody(""); setAnnPin(false);
      setShowAddAnn(false);
    } finally { setPostingAnn(false); }
  };

  const handleTogglePin = async (ann: Announcement) => {
    await fetchWithAuth("/api/organisations/org_announcements", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: ann.announcement_id, pinned: !ann.pinned }),
    });
    setAnnouncements(prev =>
      prev.map(a => a.announcement_id === ann.announcement_id ? { ...a, pinned: ann.pinned ? 0 : 1 } : a)
        .sort((a, b) => b.pinned - a.pinned || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    );
  };

  const handleDeleteAnn = async (id: number) => {
    await fetchWithAuth(`/api/organisations/org_announcements?announcementId=${id}`, { method: "DELETE" });
    setAnnouncements(prev => prev.filter(a => a.announcement_id !== id));
  };

  // ── helpers ──
  const canEdit = isOwner || isStaff;
  const now = new Date();

  const upcomingSessions = sessions.filter(s => new Date(s.scheduled_at) >= now);
  const pastSessions     = sessions.filter(s => new Date(s.scheduled_at) < now);

  const fmtDate = (dt: string) => {
    const d = new Date(dt);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return (
    <div className="flex flex-col items-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );

  if (!org) return null;

  const roleLabel = isOwner ? "Owner" : isStaff ? membership?.role || "Coach" : "Member";

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">

      {/* Back */}
      <button onClick={() => router.push("/clans")}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Groups
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-glow-blue-sm">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="display-font font-bold text-2xl text-slate-800 dark:text-white tracking-wide">{org.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Training Centre · {roleLabel}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/8">
        {([
          { id: "batches" as Tab,       label: "Batches",       icon: Users     },
          { id: "schedule" as Tab,      label: "Schedule",      icon: Calendar  },
          { id: "announcements" as Tab, label: "Announcements", icon: Bell      },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === id
                ? "bg-emerald-500 text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── BATCHES TAB ── */}
      {tab === "batches" && (
        <>
          {/* Owner: New Batch button */}
          {isOwner && (
            <div className="flex justify-end">
              <button onClick={() => setShowCreateBatch(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors">
                <Plus className="w-4 h-4" /> New Batch
              </button>
            </div>
          )}

          {batches.length === 0 ? (
            <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">No batches yet.</p>
              {isOwner && (
                <button onClick={() => setShowCreateBatch(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors">
                  <Plus className="w-4 h-4" /> Create First Batch
                </button>
              )}
            </div>
          ) : isOwner ? (
            /* Owner batch grid — shows invite codes */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {batches.map(batch => (
                <div key={batch.clan_id} className="sport-card overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="display-font font-bold text-slate-800 dark:text-white text-base tracking-wide">{batch.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {batch.member_count} {batch.member_count === 1 ? "member" : "members"}
                        </p>
                      </div>
                      <button onClick={() => router.push(`/org/batch?batchId=${batch.clan_id}&batchName=${encodeURIComponent(batch.name)}`)}
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors">
                        Manage <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Invite code */}
                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Invite Code</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono tracking-widest text-lg font-bold text-slate-800 dark:text-white">{batch.invite_code}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleCopyCode(batch.clan_id, batch.invite_code)}
                            className="p-1.5 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-emerald-400/50 transition-colors">
                            {copiedCode === batch.clan_id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                          </button>
                          <button onClick={() => handleRegenerateCode(batch.clan_id)} disabled={regenerating === batch.clan_id}
                            className="p-1.5 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-emerald-400/50 transition-colors disabled:opacity-40">
                            <RefreshCw className={`w-4 h-4 text-slate-400 ${regenerating === batch.clan_id ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <ShareInviteButton type="batch" id={batch.clan_id} name={batch.name}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Member / Coach batch list — highlights user's batch */
            <div className="sport-card overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
              <div className="p-2">
                {batches.map(batch => {
                  const isMyBatch = membership?.clan_id === batch.clan_id;
                  return (
                    <button key={batch.clan_id}
                      onClick={() => router.push(`/clan/clandetails?clanId=${batch.clan_id}`)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                        isMyBatch
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40"
                          : "hover:bg-slate-50 dark:hover:bg-white/4 border border-transparent"
                      }`}>
                      <div className={`p-2 rounded-lg ${isMyBatch ? "bg-emerald-500/20 border border-emerald-400/30" : "bg-slate-100 dark:bg-white/6 border border-slate-200 dark:border-white/8"}`}>
                        <Users className={`w-4 h-4 ${isMyBatch ? "text-emerald-500 dark:text-emerald-400" : "text-slate-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${isMyBatch ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>
                            {batch.name}
                          </p>
                          {isMyBatch && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                              <Crown className="w-2.5 h-2.5" /> My Batch
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {batch.member_count} {batch.member_count === 1 ? "member" : "members"}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isMyBatch ? "text-emerald-400" : "text-slate-300 dark:text-slate-600"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SCHEDULE TAB ── */}
      {tab === "schedule" && (
        <>
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={() => { setSessDate(localDatetimeStr(new Date())); setShowAddSession(true); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors">
                <Plus className="w-4 h-4" /> Add Session
              </button>
            </div>
          )}

          {loadingSessions ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">No org-wide sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingSessions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 px-1">Upcoming</p>
                  <div className="space-y-2">
                    {upcomingSessions.map(s => (
                      <div key={s.session_id} className="sport-card overflow-hidden">
                        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                        <div className="p-4 flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex-shrink-0">
                            <Calendar className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-white text-sm">{s.title}</p>
                            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-0.5">{fmtDate(s.scheduled_at)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{s.duration_minutes} min</p>
                            {s.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{s.notes}</p>}
                          </div>
                          {canEdit && (
                            <button onClick={() => handleDeleteSession(s.session_id)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex-shrink-0">
                              <Trash2 className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-rose-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pastSessions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 px-1">Past</p>
                  <div className="space-y-2 opacity-60">
                    {[...pastSessions].reverse().map(s => (
                      <div key={s.session_id} className="sport-card overflow-hidden">
                        <div className="p-4 flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/6 flex-shrink-0">
                            <Calendar className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{s.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(s.scheduled_at)}</p>
                          </div>
                          {canEdit && (
                            <button onClick={() => handleDeleteSession(s.session_id)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex-shrink-0">
                              <Trash2 className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-rose-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── ANNOUNCEMENTS TAB ── */}
      {tab === "announcements" && (
        <>
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={() => setShowAddAnn(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors">
                <Plus className="w-4 h-4" /> Post Announcement
              </button>
            </div>
          )}

          {loadingAnn ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
          ) : announcements.length === 0 ? (
            <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
              <Bell className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.announcement_id} className="sport-card overflow-hidden">
                  {ann.pinned ? (
                    <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-500" />
                  ) : (
                    <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        {ann.pinned ? <Pin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> : null}
                        <p className="font-bold text-slate-800 dark:text-white text-sm">{ann.title}</p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleTogglePin(ann)}
                            title={ann.pinned ? "Unpin" : "Pin"}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/6 transition-colors">
                            <Pin className={`w-3.5 h-3.5 ${ann.pinned ? "text-blue-400" : "text-slate-300 dark:text-slate-600"}`} />
                          </button>
                          <button onClick={() => handleDeleteAnn(ann.announcement_id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hover:text-rose-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{ann.body}</p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {ann.author_name || "Coach"} · {new Date(ann.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── MODALS ── */}

      {/* Create Batch */}
      <Modal open={showCreateBatch} onClose={() => setShowCreateBatch(false)}
        accentClass="bg-gradient-to-r from-emerald-500 to-teal-500">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="font-bold text-slate-800 dark:text-white">Create New Batch</h2>
        </div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Batch Name</label>
        <input type="text" value={batchName} onChange={e => setBatchName(e.target.value)}
          placeholder="e.g. Morning Batch, Advanced Group"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 mb-3"
        />
        <p className="text-xs text-slate-400 mb-5">An invite code will be auto-generated for your students.</p>
        <button onClick={handleCreateBatch} disabled={creating || !batchName.trim()}
          className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold transition-colors disabled:opacity-50">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? "Creating…" : "Create Batch"}
        </button>
      </Modal>

      {/* Add Session */}
      <Modal open={showAddSession} onClose={() => setShowAddSession(false)}
        accentClass="bg-gradient-to-r from-emerald-500 to-teal-500">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl">
            <Calendar className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="font-bold text-slate-800 dark:text-white">Add Org-wide Session</h2>
        </div>

        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title</label>
        <input type="text" value={sessTitle} onChange={e => setSessTitle(e.target.value)}
          placeholder="e.g. Annual Fitness Test"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 mb-3"
        />
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date & Time</label>
        <input type="datetime-local" value={sessDate} min={localDatetimeStr(new Date())}
          onChange={e => setSessDate(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 mb-3"
        />
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Duration</label>
        <div className="flex gap-2 mb-3">
          {DURATION_OPTS.map(d => (
            <button key={d} onClick={() => setSessDur(d)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                sessDur === d ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-white/6 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10"
              }`}>
              {d}m
            </button>
          ))}
        </div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Notes (optional)</label>
        <textarea value={sessNotes} onChange={e => setSessNotes(e.target.value)} rows={2}
          placeholder="Any notes for this session…"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 resize-none mb-4"
        />
        <button onClick={handleAddSession} disabled={addingSession || !sessDate}
          className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold transition-colors disabled:opacity-50">
          {addingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {addingSession ? "Saving…" : "Add Session"}
        </button>
      </Modal>

      {/* Post Announcement */}
      <Modal open={showAddAnn} onClose={() => setShowAddAnn(false)}
        accentClass="bg-gradient-to-r from-blue-500 to-teal-500">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-blue-400/10 border border-blue-400/20 rounded-xl">
            <Bell className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="font-bold text-slate-800 dark:text-white">Post Announcement</h2>
        </div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title</label>
        <input type="text" value={annTitle} onChange={e => setAnnTitle(e.target.value)}
          placeholder="e.g. Academy closed this Sunday"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 mb-3"
        />
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
        <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} rows={3}
          placeholder="Write your announcement here…"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 resize-none mb-3"
        />
        <label className="flex items-center gap-2.5 cursor-pointer mb-5">
          <div
            onClick={() => setAnnPin(p => !p)}
            className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${annPin ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${annPin ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-300">Pin this announcement</span>
        </label>
        <button onClick={handlePostAnn} disabled={postingAnn || !annTitle.trim() || !annBody.trim()}
          className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50">
          {postingAnn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          {postingAnn ? "Posting…" : "Post Announcement"}
        </button>
      </Modal>
    </div>
  );
}
