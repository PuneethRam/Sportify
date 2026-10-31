"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  Users, Trophy, Activity, TrendingUp, User, ArrowLeft,
  CalendarDays, Check, Minus, Clock, ChevronLeft, ChevronRight, Loader2,
  Pin, PinOff, Trash2, Plus, Megaphone, CalendarPlus, ChevronRight as ChevronRightIcon,
} from "lucide-react";

type Member = {
  user_id: string; name: string; email: string; role: string;
  clan_points: number; matchesplayed: number; matcheswon: number; matcheslost: number;
};
type AttendanceStatus = "present" | "absent" | "late";
type AttendanceRecord = { userId: string; status: AttendanceStatus };
type AttendanceSummaryRow = { user_id: string; name: string; present_count: number; late_count: number; absent_count: number };
type TrainingSession = { session_id: number; title: string; scheduled_at: string; duration_minutes: number; notes: string | null };
type Announcement = { announcement_id: number; author_id: string; author_name: string | null; title: string; body: string; pinned: number; created_at: string };

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function localDt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_CFG: Record<AttendanceStatus, { icon: React.ReactNode; active: string; inactive: string; label: string }> = {
  present: { label: "Present", icon: <Check className="w-3.5 h-3.5" />, active: "bg-emerald-500 text-white border-emerald-500", inactive: "border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:border-emerald-300 hover:text-emerald-500" },
  late:    { label: "Late",    icon: <Clock className="w-3.5 h-3.5" />, active: "bg-amber-400 text-white border-amber-400",   inactive: "border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:border-amber-300 hover:text-amber-500"   },
  absent:  { label: "Absent",  icon: <Minus className="w-3.5 h-3.5" />, active: "bg-rose-500 text-white border-rose-500",     inactive: "border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:border-rose-300 hover:text-rose-500"     },
};

function CoachDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const batchId = searchParams.get("batchId");
  const batchName = searchParams.get("batchName") || "Batch";

  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "schedule" | "announcements">("overview");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(toDateStr(new Date()));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDates, setSavedDates] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{ totalSessions: number; data: AttendanceSummaryRow[] }>({ totalSessions: 0, data: [] });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Schedule state
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: "", scheduledAt: localDt(new Date(Date.now() + 86400000)), duration: 60, notes: "" });
  const [addingSession, setAddingSession] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [showAddAnnouncement, setShowAddAnnouncement] = useState(false);
  const [annForm, setAnnForm] = useState({ title: "", body: "", pinned: false });
  const [postingAnn, setPostingAnn] = useState(false);

  // Auth
  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(u => {
      setCurrentUserId(u?.uid ?? null);
      setCurrentUserName(u?.displayName || u?.email?.split("@")[0] || "");
    });
    return () => unsub();
  }, []);

  // Members
  useEffect(() => {
    if (!batchId) return;
    fetchWithAuth(`/api/organisations/batch_members?batchId=${batchId}`)
      .then(r => r.json()).then(d => setMembers(d.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [batchId]);

  // Attendance for selected date
  useEffect(() => {
    if (!batchId || activeTab !== "attendance") return;
    const students = members.filter(m => m.role === "Member");
    setAttendanceLoading(true);
    fetchWithAuth(`/api/organisations/attendance?batchId=${batchId}&date=${attendanceDate}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.length > 0) {
          const saved = d.data.reduce((acc: Record<string, AttendanceStatus>, row: { user_id: string; status: AttendanceStatus }) => { acc[row.user_id] = row.status; return acc; }, {});
          setRecords(students.map(s => ({ userId: s.user_id, status: saved[s.user_id] ?? "absent" })));
          setSavedDates(prev => new Set([...prev, attendanceDate]));
        } else {
          setRecords(students.map(s => ({ userId: s.user_id, status: "present" })));
        }
      })
      .catch(() => setRecords(members.filter(m => m.role === "Member").map(s => ({ userId: s.user_id, status: "present" }))))
      .finally(() => setAttendanceLoading(false));
  }, [batchId, attendanceDate, activeTab, members]);

  // Attendance summary
  useEffect(() => {
    if (!batchId || activeTab !== "attendance") return;
    setSummaryLoading(true);
    fetchWithAuth(`/api/organisations/attendance/summary?batchId=${batchId}`)
      .then(r => r.json()).then(d => { if (d.success) setSummary({ totalSessions: d.totalSessions, data: d.data }); })
      .catch(() => {}).finally(() => setSummaryLoading(false));
  }, [batchId, activeTab]);

  // Sessions
  const loadSessions = () => {
    if (!batchId) return;
    setSessionsLoading(true);
    fetchWithAuth(`/api/organisations/sessions?batchId=${batchId}`)
      .then(r => r.json()).then(d => { if (d.success) setSessions(d.data); })
      .catch(() => {}).finally(() => setSessionsLoading(false));
  };
  useEffect(() => { if (activeTab === "schedule") loadSessions(); }, [batchId, activeTab]);

  // Announcements
  const loadAnnouncements = () => {
    if (!batchId) return;
    setAnnouncementsLoading(true);
    fetchWithAuth(`/api/organisations/announcements?batchId=${batchId}`)
      .then(r => r.json()).then(d => { if (d.success) setAnnouncements(d.data); })
      .catch(() => {}).finally(() => setAnnouncementsLoading(false));
  };
  useEffect(() => { if (activeTab === "announcements") loadAnnouncements(); }, [batchId, activeTab]);

  const students = members.filter(m => m.role === "Member");
  const coaches = members.filter(m => m.role === "Coach" || m.role === "Admin");
  const isCoach = coaches.some(c => c.user_id === currentUserId) || members.find(m => m.user_id === currentUserId)?.role === "Admin";

  const totalMatches = students.reduce((sum, m) => sum + (m.matchesplayed || 0), 0);
  const totalWins = students.reduce((sum, m) => sum + (m.matcheswon || 0), 0);
  const avgWinRate = students.length > 0 ? Math.round(students.reduce((sum, m) => sum + (m.matchesplayed > 0 ? (m.matcheswon / m.matchesplayed) * 100 : 0), 0) / students.length) : 0;
  // Attendance helpers
  const setStatus = (userId: string, status: AttendanceStatus) => setRecords(prev => prev.map(r => r.userId === userId ? { ...r, status } : r));
  const saveAttendance = async () => {
    if (!batchId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/organisations/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, date: attendanceDate, records }) });
      const d = await res.json();
      if (d.success) {
        setSavedDates(prev => new Set([...prev, attendanceDate]));
        fetchWithAuth(`/api/organisations/attendance/summary?batchId=${batchId}`).then(r => r.json()).then(d => { if (d.success) setSummary({ totalSessions: d.totalSessions, data: d.data }); });
      }
    } finally { setSaving(false); }
  };
  const shiftDate = (days: number) => { const d = new Date(attendanceDate); d.setDate(d.getDate() + days); setAttendanceDate(toDateStr(d)); };
  const summaryMap = summary.data.reduce((acc, row) => { acc[row.user_id] = row; return acc; }, {} as Record<string, AttendanceSummaryRow>);
  const attRate = (userId: string) => { if (summary.totalSessions === 0) return null; const row = summaryMap[userId]; if (!row) return 0; return Math.round(((row.present_count + row.late_count) / summary.totalSessions) * 100); };

  // Schedule helpers
  const addSession = async () => {
    if (!batchId || !sessionForm.scheduledAt) return;
    setAddingSession(true);
    try {
      await fetchWithAuth("/api/organisations/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, title: sessionForm.title || "Training Session", scheduledAt: sessionForm.scheduledAt.replace("T", " ") + ":00", durationMinutes: sessionForm.duration, notes: sessionForm.notes || null }) });
      setShowAddSession(false);
      setSessionForm({ title: "", scheduledAt: localDt(new Date(Date.now() + 86400000)), duration: 60, notes: "" });
      loadSessions();
    } finally { setAddingSession(false); }
  };
  const deleteSession = async (id: number) => {
    await fetchWithAuth(`/api/organisations/sessions?sessionId=${id}`, { method: "DELETE" });
    setSessions(prev => prev.filter(s => s.session_id !== id));
  };

  // Announcement helpers
  const postAnnouncement = async () => {
    if (!batchId || !currentUserId || !annForm.title.trim() || !annForm.body.trim()) return;
    setPostingAnn(true);
    try {
      await fetchWithAuth("/api/organisations/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, authorName: currentUserName, title: annForm.title.trim(), body: annForm.body.trim(), pinned: annForm.pinned }) });
      setShowAddAnnouncement(false);
      setAnnForm({ title: "", body: "", pinned: false });
      loadAnnouncements();
    } finally { setPostingAnn(false); }
  };
  const togglePin = async (ann: Announcement) => {
    await fetchWithAuth("/api/organisations/announcements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ announcementId: ann.announcement_id, pinned: !ann.pinned }) });
    setAnnouncements(prev => prev.map(a => a.announcement_id === ann.announcement_id ? { ...a, pinned: ann.pinned ? 0 : 1 } : a).sort((a, b) => b.pinned - a.pinned || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };
  const deleteAnnouncement = async (id: number) => {
    await fetchWithAuth(`/api/organisations/announcements?announcementId=${id}`, { method: "DELETE" });
    setAnnouncements(prev => prev.filter(a => a.announcement_id !== id));
  };

  const TABS = [
    { id: "overview" as const,       label: "Overview",      icon: <Activity className="w-3.5 h-3.5" />      },
    { id: "attendance" as const,     label: "Attendance",    icon: <CalendarDays className="w-3.5 h-3.5" />   },
    { id: "schedule" as const,       label: "Schedule",      icon: <CalendarPlus className="w-3.5 h-3.5" />   },
    { id: "announcements" as const,  label: "Announcements", icon: <Megaphone className="w-3.5 h-3.5" />      },
  ];

  const now = new Date();
  const upcomingSessions = sessions.filter(s => new Date(s.scheduled_at) >= now);
  const pastSessions = sessions.filter(s => new Date(s.scheduled_at) < now);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl sm:text-3xl tracking-wide text-slate-800 dark:text-white">{batchName}</h1>
          <p className="text-xs text-slate-400">Coach View · Batch Overview</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 flex-shrink-0 ${activeTab === t.id ? "tab-pill-active" : "tab-pill-inactive"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Students",     value: students.length, gradient: "from-blue-500 to-teal-600", icon: <Users className="w-4 h-4 text-white" /> },
                  { label: "Total Matches",value: totalMatches,    gradient: "from-emerald-500 to-teal-600",  icon: <Activity className="w-4 h-4 text-white" /> },
                  { label: "Total Wins",   value: totalWins,       gradient: "from-amber-400 to-orange-500",  icon: <Trophy className="w-4 h-4 text-white" /> },
                  { label: "Avg Win Rate", value: `${avgWinRate}%`,gradient: "from-teal-500 to-blue-600",   icon: <TrendingUp className="w-4 h-4 text-white" /> },
                ].map(({ label, value, gradient, icon }) => (
                  <div key={label} className="sport-card p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>{icon}</div>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">{label}</span>
                    </div>
                    <p className="stat-num text-3xl text-slate-800 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              {coaches.length > 0 && (
                <div className="sport-card overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                  <div className="p-4 sm:p-5">
                    <h2 className="section-heading flex items-center gap-2 mb-4"><User className="w-4 h-4 text-emerald-400" /> Coaches</h2>
                    <div className="flex flex-wrap gap-2.5">
                      {coaches.map(coach => (
                        <div key={coach.user_id} className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-400/8 border border-emerald-200/60 dark:border-emerald-400/15 rounded-full">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">{coach.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{coach.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ATTENDANCE TAB ── */}
          {activeTab === "attendance" && (
            <div className="space-y-5 pb-10">
              <div className="sport-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Session Date</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => shiftDate(-1)} className="p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                  <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm font-mono focus:outline-none focus:border-emerald-400 dark:focus:border-emerald-500 transition-all" />
                  <button onClick={() => shiftDate(1)} disabled={attendanceDate >= toDateStr(new Date())} className="p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
                  <button onClick={() => setAttendanceDate(toDateStr(new Date()))} className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors flex-shrink-0">Today</button>
                </div>
                {savedDates.has(attendanceDate) && <p className="text-xs text-emerald-500 mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Saved for this date</p>}
              </div>

              <div className="sport-card overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="section-heading flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-400" /> Mark Attendance</h2>
                    <div className="flex gap-2 text-xs text-slate-400">
                      <span className="text-emerald-500">{records.filter(r => r.status === "present").length}P</span>
                      <span className="text-amber-500">{records.filter(r => r.status === "late").length}L</span>
                      <span className="text-rose-500">{records.filter(r => r.status === "absent").length}A</span>
                    </div>
                  </div>
                  {students.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 dark:border-white/8 rounded-2xl p-10 text-center"><Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">No students yet.</p></div>
                  ) : attendanceLoading ? (
                    <div className="flex items-center justify-center py-12 gap-3"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /><p className="text-sm text-slate-400">Loading…</p></div>
                  ) : (
                    <div className="space-y-2">
                      {students.map(student => {
                        const status = records.find(r => r.userId === student.user_id)?.status ?? "absent";
                        return (
                          <div key={student.user_id} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-white/6 bg-slate-50/50 dark:bg-white/2">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-sm">{student.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <p className="flex-1 font-medium text-sm text-slate-700 dark:text-slate-200 truncate">{student.name}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              {(["present", "late", "absent"] as AttendanceStatus[]).map(s => (
                                <button key={s} onClick={() => setStatus(student.user_id, s)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${status === s ? STATUS_CFG[s].active : STATUS_CFG[s].inactive}`}>
                                  {STATUS_CFG[s].icon}<span className="hidden sm:inline">{STATUS_CFG[s].label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {students.length > 0 && !attendanceLoading && (
                    <div className="mt-4 flex gap-2 justify-end">
                      <button onClick={() => setRecords(prev => prev.map(r => ({ ...r, status: "present" })))} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">All Present</button>
                      <button onClick={saveAttendance} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {saving ? "Saving…" : "Save Attendance"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {summary.totalSessions > 0 && (
                <div className="sport-card overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-blue-400 to-teal-500" />
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-heading flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-400" /> Attendance Overview</h2>
                      <span className="text-xs text-slate-400">{summary.totalSessions} sessions</span>
                    </div>
                    {summaryLoading ? <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : (
                      <div className="space-y-2">
                        {students.map(s => {
                          const rate = attRate(s.user_id) ?? 0;
                          const row = summaryMap[s.user_id];
                          const barColor = rate >= 80 ? "from-emerald-400 to-teal-500" : rate >= 60 ? "from-amber-400 to-orange-400" : "from-rose-400 to-pink-500";
                          const rateColor = rate >= 80 ? "text-emerald-500 dark:text-emerald-400" : rate >= 60 ? "text-amber-500 dark:text-amber-400" : "text-rose-500 dark:text-rose-400";
                          return (
                            <div key={s.user_id}
                              onClick={() => router.push(`/org/report?userId=${s.user_id}&batchId=${batchId}&batchName=${encodeURIComponent(batchName)}`)}
                              className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-white/6 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-all group">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-teal-600 flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{s.name.charAt(0).toUpperCase()}</span></div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate mb-1">{s.name}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 progress-track"><div className={`progress-fill bg-gradient-to-r ${barColor}`} style={{ width: `${rate}%` }} /></div>
                                  <span className={`stat-num text-xs w-8 text-right flex-shrink-0 ${rateColor}`}>{rate}%</span>
                                </div>
                              </div>
                              <div className="flex gap-2 text-xs flex-shrink-0">
                                <span className="text-emerald-500">{row?.present_count ?? 0}P</span>
                                <span className="text-amber-500">{row?.late_count ?? 0}L</span>
                                <span className="text-rose-500">{row?.absent_count ?? 0}A</span>
                              </div>
                              <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-emerald-400 flex-shrink-0 transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SCHEDULE TAB ── */}
          {activeTab === "schedule" && (
            <div className="space-y-5 pb-10">
              {isCoach && (
                <button onClick={() => setShowAddSession(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all">
                  <Plus className="w-4 h-4" /> Add Session
                </button>
              )}

              {/* Add session modal */}
              {showAddSession && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
                  <div className="sport-card w-full max-w-md">
                    <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <div className="p-5 space-y-4">
                      <h2 className="font-bold text-slate-800 dark:text-white">Add Training Session</h2>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Title</label>
                        <input value={sessionForm.title} onChange={e => setSessionForm(p => ({ ...p, title: e.target.value }))} placeholder="Training Session" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-emerald-400 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date & Time *</label>
                        <input type="datetime-local" value={sessionForm.scheduledAt} onChange={e => setSessionForm(p => ({ ...p, scheduledAt: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-emerald-400 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Duration</label>
                        <div className="flex gap-2">
                          {[30, 60, 90, 120].map(d => (
                            <button key={d} onClick={() => setSessionForm(p => ({ ...p, duration: d }))} className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${sessionForm.duration === d ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-emerald-300"}`}>{d}m</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</label>
                        <textarea value={sessionForm.notes} onChange={e => setSessionForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Focus areas, bring equipment, etc." className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm resize-none focus:outline-none focus:border-emerald-400 transition-all" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowAddSession(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                        <button onClick={addSession} disabled={addingSession} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
                          {addingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{addingSession ? "Adding…" : "Add Session"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {sessionsLoading ? (
                <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /><p className="text-sm text-slate-400">Loading…</p></div>
              ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
                  <CalendarPlus className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">No sessions scheduled</p>
                  {isCoach && <p className="text-sm text-slate-400">Click &quot;Add Session&quot; to schedule the first one.</p>}
                </div>
              ) : (
                <div className="space-y-5">
                  {upcomingSessions.length > 0 && (
                    <section>
                      <p className="section-heading mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Upcoming · {upcomingSessions.length}</p>
                      <div className="space-y-2">
                        {upcomingSessions.map(s => {
                          const dt = new Date(s.scheduled_at);
                          const isToday = new Date().toDateString() === dt.toDateString();
                          return (
                            <div key={s.session_id} className="sport-card p-4 flex items-start gap-4">
                              <div className="flex-shrink-0 text-center w-12">
                                <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">{dt.toLocaleDateString([], { month: "short" })}</p>
                                <p className="stat-num text-2xl text-slate-800 dark:text-white leading-none">{dt.getDate()}</p>
                                {isToday && <p className="text-[10px] font-bold text-emerald-500 uppercase">Today</p>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-slate-800 dark:text-white">{s.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {s.duration_minutes}min</p>
                                {s.notes && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{s.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isCoach && isToday && (
                                  <button onClick={() => { setAttendanceDate(toDateStr(dt)); setActiveTab("attendance"); }} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/25 transition-colors">
                                    Attendance
                                  </button>
                                )}
                                {isCoach && <button onClick={() => deleteSession(s.session_id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {pastSessions.length > 0 && (
                    <section>
                      <p className="section-heading mb-3 text-slate-400">Past · {pastSessions.length}</p>
                      <div className="space-y-2">
                        {[...pastSessions].reverse().map(s => {
                          const dt = new Date(s.scheduled_at);
                          return (
                            <div key={s.session_id} className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 dark:border-white/6 opacity-60">
                              <div className="flex-shrink-0 text-center w-12">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{dt.toLocaleDateString([], { month: "short" })}</p>
                                <p className="stat-num text-2xl text-slate-500 dark:text-slate-400 leading-none">{dt.getDate()}</p>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">{s.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {s.duration_minutes}min</p>
                              </div>
                              {isCoach && (
                                <button onClick={() => { setAttendanceDate(toDateStr(dt)); setActiveTab("attendance"); }} className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors flex-shrink-0">
                                  Attendance
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ANNOUNCEMENTS TAB ── */}
          {activeTab === "announcements" && (
            <div className="space-y-4 pb-10">
              {isCoach && (
                <button onClick={() => setShowAddAnnouncement(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-glow-blue-sm">
                  <Plus className="w-4 h-4" /> New Announcement
                </button>
              )}

              {/* Post announcement modal */}
              {showAddAnnouncement && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
                  <div className="sport-card w-full max-w-md">
                    <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600" />
                    <div className="p-5 space-y-4">
                      <h2 className="font-bold text-slate-800 dark:text-white">New Announcement</h2>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Title *</label>
                        <input value={annForm.title} onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Drill of the week" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-400 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Message *</label>
                        <textarea value={annForm.body} onChange={e => setAnnForm(p => ({ ...p, body: e.target.value }))} rows={4} placeholder="Write your announcement…" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm resize-none focus:outline-none focus:border-blue-400 transition-all" />
                      </div>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(p => ({ ...p, pinned: e.target.checked }))} className="accent-blue-500 w-4 h-4" />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Pin to top</span>
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => setShowAddAnnouncement(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                        <button onClick={postAnnouncement} disabled={postingAnn || !annForm.title.trim() || !annForm.body.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
                          {postingAnn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}{postingAnn ? "Posting…" : "Post"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {announcementsLoading ? (
                <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><p className="text-sm text-slate-400">Loading…</p></div>
              ) : announcements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-12 text-center">
                  <Megaphone className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">No announcements yet</p>
                  {isCoach && <p className="text-sm text-slate-400">Post your first announcement for the batch.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map(ann => (
                    <div key={ann.announcement_id} className={`sport-card overflow-hidden ${ann.pinned ? "border-blue-200 dark:border-blue-500/25" : ""}`}>
                      <div className={`h-0.5 bg-gradient-to-r ${ann.pinned ? "from-blue-500 to-teal-600" : "from-slate-300 to-slate-200 dark:from-white/10 dark:to-white/5"}`} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {ann.pinned ? <Pin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : null}
                            <h3 className="font-bold text-sm text-slate-800 dark:text-white truncate">{ann.title}</h3>
                          </div>
                          {isCoach && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => togglePin(ann)} title={ann.pinned ? "Unpin" : "Pin"} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                                {ann.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => deleteAnnouncement(ann.announcement_id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{ann.body}</p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {ann.author_name ?? "Coach"} · {new Date(ann.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BatchPageFallback() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="h-10 w-48 rounded-xl bg-slate-100 dark:bg-white/8 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="sport-card h-24 animate-pulse" />)}</div>
      <div className="sport-card h-64 animate-pulse" />
    </div>
  );
}

export default function CoachDashboard() {
  return (
    <Suspense fallback={<BatchPageFallback />}>
      <CoachDashboardContent />
    </Suspense>
  );
}
