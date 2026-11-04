"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { track } from "@/lib/track";

interface Props {
  type: "clan" | "batch" | "session";
  id: number | string;
  name: string;
  className?: string;
}

// Gets (or creates) the invite link and opens the share sheet — on phones
// that's where WhatsApp is. Desktop browsers without one get the link copied.
export default function ShareInviteButton({ type, id, name, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const share = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetchWithAuth("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: Number(id) }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error ?? "Couldn't create a link"); return; }
      track("invite_link_created", { target_type: type, created: data.created });

      const text = `Join ${name} on Sportify`;
      if (navigator.share) {
        await navigator.share({ title: text, text: `${text}: ${data.url}`, url: data.url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(`${text}: ${data.url}`);
        setMessage("Invite link copied");
        setTimeout(() => setMessage(""), 2500);
      }
    } catch {
      setMessage("Couldn't create a link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button onClick={share} disabled={busy}
        className={className ?? "flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-colors text-xs font-semibold disabled:opacity-50"}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : message === "Invite link copied" ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
        Share invite
      </button>
      {message && <span className="mt-1 text-[11px] text-slate-300">{message}</span>}
    </span>
  );
}
