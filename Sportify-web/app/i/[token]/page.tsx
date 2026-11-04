"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, CalendarDays, MapPin, Smartphone, Zap } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { track } from "@/lib/track";

interface Preview {
  type: "clan" | "batch" | "session";
  status: "active" | "revoked" | "expired";
  invitedBy: string | null;
  alreadyMember: boolean | null;
  target: {
    name: string;
    orgName?: string | null;
    memberCount?: number;
    sport?: string | null;
    location?: string;
    scheduledAt?: string;
    hostName?: string | null;
    maxPlayers?: number;
    joinedCount?: number;
    sessionStatus?: string;
  };
}

const KIND = { clan: "clan", batch: "academy batch", session: "game" };
const APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL;

// Landing page for https://<app>/i/<token>. Shows what the link is for; a
// signed-out visitor goes through sign-in and comes back here to join in one tap.
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const opened = useRef(false);

  useEffect(() => { auth.authStateReady().then(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = user ? await fetchWithAuth(`/api/invites/${token}`) : await fetch(`/api/invites/${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "This invite link doesn't exist"); return; }
      setPreview(data);
      if (!opened.current) {
        opened.current = true;
        track("invite_link_opened", { target_type: data.type, status: data.status, signed_in: !!user });
      }
    })().catch(() => setError("Couldn't load this invite. Check your connection and try again."));
  }, [ready, user, token]);

  const join = async () => {
    setJoining(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: user?.displayName ?? null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't join"); return; }
      track("invite_accepted", { target_type: data.type, already_member: data.alreadyMember });
      if (!data.alreadyMember) {
        track(data.type === "batch" ? "batch_joined" : data.type === "session" ? "session_joined" : "clan_joined", { via: "invite" });
      }
      router.push(data.path);
    } catch {
      setError("Couldn't join. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  };

  const next = encodeURIComponent(`/i/${token}`);
  const t = preview?.target;
  const unavailable = preview && preview.status !== "active";
  const sessionClosed = preview?.type === "session" && (t?.sessionStatus === "cancelled" || t?.sessionStatus === "completed");

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 fill-white text-white" />
          </div>
          <span className="display-font font-bold text-2xl tracking-wide text-white">
            SPORT<span className="text-blue-400">IFY</span>
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
          {!preview && !error && (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
          )}

          {!preview && error && <p className="text-center text-slate-300 py-6">{error}</p>}

          {preview && t && (
            <>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                {preview.invitedBy ? `${preview.invitedBy} invited you to join this ${KIND[preview.type]}` : `You're invited to join this ${KIND[preview.type]}`}
              </p>
              <h1 className="text-2xl font-bold text-white mb-1">{t.name}</h1>
              {t.orgName && <p className="text-slate-300 mb-3">{t.orgName}</p>}

              <div className="space-y-2 text-sm text-slate-300 my-4">
                {t.memberCount !== undefined && (
                  <p className="flex items-center gap-2"><Users size={16} /> {t.memberCount} member{t.memberCount === 1 ? "" : "s"}</p>
                )}
                {t.scheduledAt && (
                  <p className="flex items-center gap-2"><CalendarDays size={16} /> {new Date(t.scheduledAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                )}
                {t.location && <p className="flex items-center gap-2"><MapPin size={16} /> {t.location}</p>}
                {t.maxPlayers !== undefined && (
                  <p className="flex items-center gap-2"><Users size={16} /> {t.joinedCount}/{t.maxPlayers} players{t.hostName ? ` · hosted by ${t.hostName}` : ""}</p>
                )}
              </div>

              {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

              {unavailable ? (
                <p className="text-slate-300">
                  This link has {preview.status === "expired" ? "expired" : "been turned off"}. Ask for a new one.
                </p>
              ) : sessionClosed ? (
                <p className="text-slate-300">This game is {t.sessionStatus}.</p>
              ) : user ? (
                <button onClick={join} disabled={joining}
                  className="w-full flex justify-center items-center p-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-70">
                  {joining ? <Loader2 className="animate-spin" size={20} /> : preview.alreadyMember ? "Open" : "Join"}
                </button>
              ) : (
                <div className="space-y-3">
                  <a href={`/auth/signup?next=${next}`}
                    className="block text-center w-full p-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition">
                    Create an account to join
                  </a>
                  <a href={`/auth/login?next=${next}`}
                    className="block text-center w-full p-3 border border-white/15 hover:bg-white/5 text-white rounded-lg transition">
                    I already have an account
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {APP_URL && (
          <a href={APP_URL} className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white">
            <Smartphone size={16} /> Get the Sportify app
          </a>
        )}
      </div>
    </div>
  );
}
