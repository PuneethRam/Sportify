"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import {
  Users, Trophy, Calendar, Medal, TrendingUp, LogOut, ChevronRight,
  Bell, Pin, Loader2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import ShareInviteButton from "@/app/components/ShareInviteButton";

const features = [
  {
    name: "Members",
    icon: Users,
    description: "View and manage clan members",
    gradient: "from-blue-500 to-teal-600",
    glow: "bg-blue-500",
    path: "members",
  },
  {
    name: "Matches",
    icon: Calendar,
    description: "Schedule and track match history",
    gradient: "from-emerald-500 to-teal-600",
    glow: "bg-emerald-500",
    path: "matches",
  },
  {
    name: "Leaderboard",
    icon: Trophy,
    description: "Rankings and player statistics",
    gradient: "from-amber-500 to-orange-600",
    glow: "bg-amber-500",
    path: "leaderboard",
  },
  {
    name: "Tournaments",
    icon: Medal,
    description: "Compete in clan tournaments",
    gradient: "from-purple-500 to-pink-600",
    glow: "bg-purple-500",
    path: "tournaments",
  },
  {
    name: "Series",
    icon: TrendingUp,
    description: "Multi-match series and progress",
    gradient: "from-blue-500 to-cyan-600",
    glow: "bg-blue-500",
    path: "series-matches",
  },
];

type Clan = {
  id: string;
  name: string;
  clan_rank: number;
  type?: string;
  org_id?: number | null;
};

type Session = {
  session_id: number;
  batch_id: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
};

type ClanTab = "overview" | "schedule" | "announcements";

type Announcement = {
  announcement_id: number;
  batch_id: number;
  author_name: string | null;
  title: string;
  body: string;
  pinned: number;
  created_at: string;
};

function fmtDate(dt: string) {
  const d = new Date(dt);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function ClanDetailsContent() {
  const searchParams = useSearchParams();
  const clanId = searchParams.get("clanId");
  const router  = useRouter();

  const [clan, setClan]       = useState<Clan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeaving, setIsLeaving]           = useState(false);

  // batch extras
  const [tab, setTab]                         = useState<ClanTab>("overview");
  const [isBatch, setIsBatch]                 = useState(false);
  const [isAdmin, setIsAdmin]                 = useState(false);
  const [sessions, setSessions]               = useState<Session[]>([]);
  const [announcements, setAnnouncements]     = useState<Announcement[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingAnn, setLoadingAnn]           = useState(false);

  useEffect(() => {
    if (!clanId) { setLoading(false); return; }
    const fetchClan = async () => {
      try {
        const res  = await fetchWithAuth(`/api/clans/get_clan?id=${clanId}`);
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Error: ${res.status}`); }
        const data = await res.json();
        const c    = Array.isArray(data) && data.length > 0 ? data[0] : null;
        setClan(c);
        if (c?.type === "batch") setIsBatch(true);
      } catch (err) { setError(err instanceof Error ? err.message : "Unknown error"); }
      finally { setLoading(false); }
    };
    fetchClan();
    fetchWithAuth(`/api/clans/checkadmin?clanId=${clanId}`)
      .then(r => r.json()).then(d => setIsAdmin(!!d.isAdmin)).catch(() => {});
  }, [clanId]);

  const fetchSessions = useCallback(async () => {
    if (!clanId) return;
    setLoadingSessions(true);
    try {
      const res  = await fetchWithAuth(`/api/organisations/sessions?batchId=${clanId}`);
      const data = await res.json();
      if (data.success) setSessions(data.data as Session[]);
    } finally { setLoadingSessions(false); }
  }, [clanId]);

  const fetchAnnouncements = useCallback(async () => {
    if (!clanId) return;
    setLoadingAnn(true);
    try {
      const res  = await fetchWithAuth(`/api/organisations/announcements?batchId=${clanId}`);
      const data = await res.json();
      if (data.success) setAnnouncements(data.data as Announcement[]);
    } finally { setLoadingAnn(false); }
  }, [clanId]);

  useEffect(() => {
    if (isBatch) {
      fetchSessions();
      fetchAnnouncements();
    }
  }, [isBatch, fetchSessions, fetchAnnouncements]);

  const handleLeaveClan = async () => {
    if (!clanId) return;
    const user = auth.currentUser; if (!user) return;
    setIsLeaving(true);
    try {
      const res = await fetchWithAuth("/api/clans/leave_clan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      router.push("/clans");
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to leave clan"); }
    finally { setIsLeaving(false); setShowLeaveModal(false); }
  };

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-4 rounded-xl border border-rose-400/30 bg-rose-400/5 text-rose-400 text-sm">
      {error} <Link href="/clans" className="underline ml-2">← Back to Clans</Link>
    </div>
  );

  if (!clan) return (
    <div className="text-center py-16 text-slate-400">
      Clan not found. <Link href="/clans" className="text-blue-400 underline ml-1">Back to Clans</Link>
    </div>
  );

  const initials = clan.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const now      = new Date();
  const upcoming = sessions.filter(s => new Date(s.scheduled_at) >= now);
  const past     = sessions.filter(s => new Date(s.scheduled_at) < now);

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Clan Banner ── */}
      <div className="relative rounded-2xl overflow-hidden">
        <div className="h-48 sm:h-56 bg-gradient-to-br from-[#0E0B22] via-[#130F2D] to-[#0A0718] relative">
          <div className="absolute inset-0 court-bg opacity-40" />
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
          <div className="absolute bottom-0 left-8 w-32 h-32 bg-teal-600 rounded-full mix-blend-screen filter blur-3xl opacity-15" />
          <div className="absolute bottom-0 left-0 w-full h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between">
            <div className="flex items-end gap-4">
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-teal-600 flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-glow-violet">
                  {initials}
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-[#0E0B22] flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
              <div className="pb-0.5">
                <h1 className="display-font font-bold text-2xl sm:text-4xl text-white tracking-wide leading-none">{clan.name}</h1>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm text-slate-300">Global Rank</span>
                  <span className="text-sm font-bold text-amber-400">#{clan.clan_rank}</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0">
              {isAdmin && clanId && <ShareInviteButton type={isBatch ? "batch" : "clan"} id={clanId} name={clan.name} />}
              <button onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition-colors text-xs font-semibold flex-shrink-0">
                <LogOut className="w-3.5 h-3.5" /> Leave
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs (batch only) ── */}
      {isBatch && (
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/8">
          {([
            { id: "overview" as ClanTab,       label: "Overview",       icon: ChevronRight },
            { id: "schedule" as ClanTab,       label: "Schedule",       icon: Calendar     },
            { id: "announcements" as ClanTab,  label: "Announcements",  icon: Bell         },
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
      )}

      {/* ── Overview / Quick Access ── */}
      {(!isBatch || tab === "overview") && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 px-0.5">Quick Access</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.map(f => (
              <Link key={f.name} href={`/clan/${f.path}?clanId=${clanId}`}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0C0E21] p-4 flex items-center gap-4 no-underline hover:-translate-y-1 transition-all duration-200"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div className={`absolute -bottom-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity ${f.glow}`} />
                <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 relative">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{f.name}</h3>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{f.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Schedule Tab ── */}
      {isBatch && tab === "schedule" && (
        <div>
          {loadingSessions ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No sessions scheduled yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcoming.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500 dark:text-emerald-400 mb-2 px-1">Upcoming</p>
                  <div className="space-y-2">
                    {upcoming.map(s => (
                      <div key={s.session_id} className="sport-card overflow-hidden">
                        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                        <div className="p-4 flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex-shrink-0">
                            <Calendar className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-white text-sm">{s.title}</p>
                            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-0.5">{fmtDate(s.scheduled_at)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{s.duration_minutes} min</p>
                            {s.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{s.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2 px-1">Past</p>
                  <div className="space-y-2 opacity-60">
                    {[...past].reverse().map(s => (
                      <div key={s.session_id} className="sport-card overflow-hidden">
                        <div className="p-4 flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/6 flex-shrink-0">
                            <Calendar className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{s.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(s.scheduled_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Announcements Tab ── */}
      {isBatch && tab === "announcements" && (
        <div>
          {loadingAnn ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
          ) : announcements.length === 0 ? (
            <div className="sport-card p-10 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
              <Bell className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.announcement_id} className="sport-card overflow-hidden">
                  {ann.pinned
                    ? <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-500" />
                    : <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                  }
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      {ann.pinned ? <Pin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> : null}
                      <p className="font-bold text-slate-800 dark:text-white text-sm">{ann.title}</p>
                      {ann.pinned ? (
                        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-400 bg-blue-500/10 border border-blue-400/20 px-2 py-0.5 rounded-full flex-shrink-0">
                          Pinned
                        </span>
                      ) : null}
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
        </div>
      )}

      {/* ── Leave Clan Modal ── */}
      {showLeaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0C0E21] border border-slate-200 dark:border-white/10 overflow-hidden shadow-xl">
            <div className="h-1 bg-gradient-to-r from-rose-500 to-red-600" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <LogOut className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 dark:text-white">Leave Clan</h2>
                  <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Are you sure you want to leave <span className="font-bold text-slate-700 dark:text-white">{clan.name}</span>? You&apos;ll lose access to all clan data.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowLeaveModal(false)} disabled={isLeaving}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  Cancel
                </button>
                <button onClick={handleLeaveClan} disabled={isLeaving}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                  {isLeaving ? "Leaving…" : "Leave Clan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClanDetailsFallback() {
  return (
    <div className="space-y-5">
      <div className="h-48 sm:h-56 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />)}
      </div>
    </div>
  );
}

const ClanDetails = () => (
  <Suspense fallback={<ClanDetailsFallback />}>
    <ClanDetailsContent />
  </Suspense>
);

export default ClanDetails;
