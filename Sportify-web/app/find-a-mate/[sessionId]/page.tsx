"use client";

import { useState, useEffect, useRef, Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  ArrowLeft, MapPin, Clock, Users, Loader2, Send, UserMinus,
  Trophy, Crown, Check, Flame, ChevronRight, AlertTriangle, Timer,
} from "lucide-react";

type SkillLevel = "any" | "beginner" | "intermediate" | "advanced";
type Player = { user_id: string; user_name: string | null; joined_at: string };
type Message = { message_id: number; user_id: string; user_name: string | null; message: string; sent_at: string };
type GameSession = {
  session_id: number;
  host_user_id: string;
  host_name: string | null;
  title: string;
  sport: string | null;
  location: string;
  scheduled_at: string;
  max_players: number;
  description: string | null;
  status: "open" | "full" | "completed" | "cancelled";
  joined_count: number;
  skill_level: SkillLevel;
};

const SKILL_CFG: Record<SkillLevel, { label: string; cls: string }> = {
  any:          { label: "All levels",   cls: "bg-slate-100 text-slate-600 dark:bg-white/8 dark:text-slate-400" },
  beginner:     { label: "Beginner",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  intermediate: { label: "Intermediate", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  advanced:     { label: "Advanced",     cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" },
};

function SkillBadge({ level }: { level: SkillLevel }) {
  const cfg = SKILL_CFG[level] ?? SKILL_CFG.any;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function useCountdownLabel(scheduledAt: string) {
  const compute = () => {
    const diffMs = new Date(scheduledAt).getTime() - Date.now();
    if (diffMs <= 0) {
      const ago = Math.floor(-diffMs / 60000);
      return ago < 5 ? "Just started" : ago < 120 ? `Started ${ago}m ago` : null;
    }
    const totalMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const isToday = new Date(scheduledAt).toDateString() === new Date().toDateString();
    if (!isToday) return null;
    if (hours === 0) return `In ${mins}m`;
    return `In ${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  };
  const [label, setLabel] = useState(compute);
  useEffect(() => {
    const iv = setInterval(() => setLabel(compute()), 30_000);
    return () => clearInterval(iv);
  }, [scheduledAt]);
  return label;
}

function ProgressBar({ joined, max }: { joined: number; max: number }) {
  const pct = Math.min(100, Math.round((joined / max) * 100));
  const color = pct >= 100 ? "from-emerald-500 to-teal-500" : pct >= 60 ? "from-amber-400 to-orange-400" : "from-blue-500 to-teal-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{joined} / {max} players joined</span>
        <span className={`stat-num text-sm ${pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-blue-400"}`}>{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 dark:bg-white/8 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SessionDetailContent({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<{ uid: string; displayName?: string | null; email?: string | null } | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [kicking, setKicking] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const lastMsgId = useRef(0);
  const pollingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(u => setUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null));
    return () => unsub();
  }, []);

  const fetchSession = async () => {
    const res = await fetchWithAuth(`/api/game-sessions/${sessionId}`);
    const d = await res.json();
    if (d.success) { setSession(d.session); setPlayers(d.players); }
  };

  useEffect(() => {
    fetchSession().finally(() => setLoading(false));
  }, [sessionId]);

  // Poll messages every 3 seconds — guarded so concurrent calls never race
  const pollMessages = async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const res = await fetchWithAuth(`/api/game-sessions/${sessionId}/messages?since=${lastMsgId.current}`);
      const d = await res.json();
      if (d.success && d.data.length > 0) {
        const newId = (d.data[d.data.length - 1] as Message).message_id;
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.message_id));
          const fresh = (d.data as Message[]).filter(m => !seen.has(m.message_id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        lastMsgId.current = newId;
      }
    } finally {
      pollingRef.current = false;
    }
  };

  useEffect(() => {
    pollMessages();
    const iv = setInterval(pollMessages, 3000);
    return () => clearInterval(iv);
  }, [sessionId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "Player";
  const isHost = session?.host_user_id === user?.uid;
  const isParticipant = players.some(p => p.user_id === user?.uid);
  const isFull = session ? (Number(session.joined_count) >= session.max_players || session.status === "full") : false;

  const join = async () => {
    if (!user || !session) return;
    setJoining(true); setActionMsg("");
    try {
      const res = await fetchWithAuth(`/api/game-sessions/${sessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid, userName }),
      });
      const d = await res.json();
      if (!d.success) { setActionMsg(d.error); return; }
      await fetchSession();
    } finally { setJoining(false); }
  };

  const leave = async () => {
    if (!user || isHost) return;
    setLeaving(true);
    try {
      await fetchWithAuth(`/api/game-sessions/${sessionId}/join`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid }),
      });
      await fetchSession();
    } finally { setLeaving(false); }
  };

  const kick = async (targetId: string) => {
    if (!user || !isHost) return;
    setKicking(targetId);
    try {
      await fetchWithAuth(`/api/game-sessions/${sessionId}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostUserId: user.uid, targetUserId: targetId }),
      });
      await fetchSession();
    } finally { setKicking(null); }
  };

  const cancelSession = async () => {
    if (!user || !isHost || !session) return;
    if (!confirm("Cancel this game? This cannot be undone.")) return;
    setCancelling(true);
    try {
      await fetchWithAuth(`/api/game-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostUserId: user.uid, status: "cancelled" }),
      });
      router.push("/find-a-mate");
    } finally { setCancelling(false); }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !user || !isParticipant) return;
    setSending(true);
    const msg = chatInput.trim();
    setChatInput("");
    try {
      await fetchWithAuth(`/api/game-sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid, userName, message: msg }),
      });
      await pollMessages();
    } finally { setSending(false); chatInputRef.current?.focus(); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  // Must be called unconditionally before any early returns
  const countdownLabel = useCountdownLabel(session?.scheduled_at ?? "");

  if (loading) return (
    <div className="flex flex-col items-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading game…</p>
    </div>
  );

  if (!session) return (
    <div className="flex flex-col items-center py-24 gap-4">
      <AlertTriangle className="w-10 h-10 text-rose-400" />
      <p className="text-slate-400">Game not found.</p>
      <button onClick={() => router.push("/find-a-mate")} className="text-blue-400 text-sm hover:underline">Back to games</button>
    </div>
  );

  const dt = new Date(session.scheduled_at);
  const isToday = new Date().toDateString() === dt.toDateString();
  const dateStr = isToday ? "Today" : dt.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const isToday2 = new Date().toDateString() === d.toDateString();
    return isToday2 ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isCancelled = session.status === "cancelled";
  const isCompleted = session.status === "completed";

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up pb-10">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push("/find-a-mate")}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors flex-shrink-0 mt-0.5">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            {session.sport && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300">
                {session.sport}
              </span>
            )}
            <SkillBadge level={session.skill_level ?? "any"} />
            <span className={`badge ${isCancelled ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" : isFull ? "badge-completed" : "badge-ongoing"}`}>
              {isCancelled ? "Cancelled" : isFull ? "Full" : <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />Open</>}
            </span>
            {countdownLabel && !isCancelled && !isCompleted && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                <Timer className="w-2.5 h-2.5" />
                {countdownLabel}
              </span>
            )}
          </div>
          <h1 className="display-font font-bold text-2xl text-slate-900 dark:text-white leading-tight">{session.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5">Hosted by <span className="font-semibold text-slate-500 dark:text-slate-300">{session.host_name ?? "Someone"}</span></p>
        </div>
      </div>

      {/* Session info card */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600" />
        <div className="p-5 space-y-4">
          {/* Progress */}
          <ProgressBar joined={Number(session.joined_count)} max={session.max_players} />

          {/* Meta row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-600 dark:text-slate-300">{session.location}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <span className="text-slate-600 dark:text-slate-300">{dateStr} · {timeStr}</span>
            </div>
          </div>

          {session.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/3 rounded-xl p-3">{session.description}</p>
          )}

          {/* Action bar */}
          {!isCancelled && !isCompleted && (
            <div className="flex gap-2 pt-1">
              {!isParticipant ? (
                <button onClick={join} disabled={joining || isFull || !user}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors disabled:opacity-50 shadow-glow-blue-sm">
                  {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                  {joining ? "Joining…" : isFull ? "Game Full" : "Join Game"}
                </button>
              ) : !isHost ? (
                <button onClick={leave} disabled={leaving}
                  className="px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-500 dark:text-rose-400 text-sm font-semibold hover:bg-rose-50 dark:hover:bg-rose-500/8 transition-colors disabled:opacity-50">
                  {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Leave"}
                </button>
              ) : null}
              {isHost && (
                <button onClick={cancelSession} disabled={cancelling}
                  className="px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-500 dark:text-rose-400 text-sm font-semibold hover:bg-rose-50 dark:hover:bg-rose-500/8 transition-colors disabled:opacity-50 ml-auto">
                  {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel Game"}
                </button>
              )}
            </div>
          )}
          {actionMsg && <p className="text-xs text-rose-400">{actionMsg}</p>}
        </div>
      </div>

      {/* Players list */}
      <div className="sport-card overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
        <div className="p-4 sm:p-5">
          <h2 className="section-heading flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-emerald-400" /> Players · {players.length}/{session.max_players}
          </h2>
          {players.length === 0 ? (
            <p className="text-sm text-slate-400">No players yet.</p>
          ) : (
            <div className="space-y-2">
              {players.map((p, i) => {
                const isMe = p.user_id === user?.uid;
                const isPlayerHost = p.user_id === session.host_user_id;
                return (
                  <div key={p.user_id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                    i === 0 && isPlayerHost
                      ? "border-amber-200/60 dark:border-amber-400/15 bg-amber-50/40 dark:bg-amber-400/5"
                      : isMe
                      ? "border-blue-200/60 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/5"
                      : "border-slate-100 dark:border-white/5 bg-transparent"
                  }`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                      isPlayerHost
                        ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white"
                        : "bg-gradient-to-br from-blue-500 to-teal-600 text-white"
                    }`}>
                      {isPlayerHost ? <Crown className="w-4 h-4" /> : (p.user_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">
                        {p.user_name ?? "Player"}
                        {isMe && <span className="ml-1.5 text-xs text-blue-400 font-normal">(you)</span>}
                      </p>
                      {isPlayerHost && <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">Host</p>}
                    </div>
                    {isHost && !isPlayerHost && (
                      <button onClick={() => kick(p.user_id)} disabled={kicking === p.user_id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                        {kicking === p.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                      </button>
                    )}
                    {isMe && !isHost && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                  </div>
                );
              })}
              {/* Placeholder slots */}
              {Array.from({ length: Math.max(0, session.max_players - players.length) }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-200 dark:border-white/8">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                    <span className="text-slate-400 dark:text-slate-500 text-sm">?</span>
                  </div>
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic">Waiting for player…</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat room */}
      {isParticipant ? (
        <div className="sport-card overflow-hidden flex flex-col" style={{ height: "440px" }}>
          <div className="h-0.5 bg-gradient-to-r from-blue-500 to-teal-600 flex-shrink-0" />
          <div className="p-4 border-b border-slate-100 dark:border-white/6 flex-shrink-0">
            <h2 className="section-heading flex items-center gap-2">
              <Trophy className="w-4 h-4 text-blue-400" /> Game Chat
              <span className="text-xs font-normal text-slate-400 ml-1">· participants only</span>
            </h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                  <ChevronRight className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-sm text-slate-400">No messages yet. Say hi!</p>
              </div>
            ) : (
              messages.map(m => {
                const isMe = m.user_id === user?.uid;
                return (
                  <div key={m.message_id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                      {!isMe && (
                        <p className="text-[10px] font-semibold text-slate-400 px-1">
                          {m.user_name ?? "Player"}
                          {m.user_id === session.host_user_id && <span className="ml-1 text-amber-400">· Host</span>}
                        </p>
                      )}
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-slate-100 dark:bg-white/8 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                      }`}>
                        {m.message}
                      </div>
                      <p className="text-[10px] text-slate-400 px-1">{formatTime(m.sent_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 dark:border-white/6 flex gap-2 flex-shrink-0">
            <input ref={chatInputRef} type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={onKeyDown} placeholder="Message the group…" maxLength={500}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-all" />
            <button onClick={sendMessage} disabled={sending || !chatInput.trim()}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 flex-shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-dashed border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 text-center">
          <p className="text-sm text-blue-500 dark:text-blue-400 font-medium">Join the game to access the chat room</p>
        </div>
      )}
    </div>
  );
}

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading game…</p>
      </div>
    }>
      <SessionDetailContent sessionId={sessionId} />
    </Suspense>
  );
}
