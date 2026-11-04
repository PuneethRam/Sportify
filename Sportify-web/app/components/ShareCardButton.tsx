"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

export type SharePayload =
  | { kind: "match"; source: "clan_singles" | "clan_doubles" | "tournament"; matchId: number | string }
  | { kind: "profile"; clanId?: number | string | null };

interface Props {
  payload: SharePayload;
  label?: string;
  className?: string;
}

// Creates a public share link (/s/<token>, whose preview image is the rank
// card) and opens the share sheet. Without one, copies the link and offers a
// WhatsApp link instead.
export default function ShareCardButton({ payload, label, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setMessage("");
    setWaLink(null);
    try {
      const body = payload.kind === "match"
        ? { kind: "match", source: payload.source, matchId: Number(payload.matchId) }
        : { kind: "profile", ...(payload.clanId ? { clanId: Number(payload.clanId) } : {}) };
      const res = await fetchWithAuth("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.url) { setMessage(data.error ?? "Couldn't create a link"); return; }

      const text = payload.kind === "match" ? "Check out this match on Sportify" : "Check out my rank on Sportify";
      if (navigator.share) {
        await navigator.share({ title: text, text, url: data.url }).catch(() => {});
      } else {
        setWaLink(`https://wa.me/?text=${encodeURIComponent(`${text}: ${data.url}`)}`);
        try {
          await navigator.clipboard.writeText(data.url);
          setMessage("Link copied");
        } catch {
          setMessage(data.url);
        }
      }
    } catch {
      setMessage("Couldn't create a link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={e => { e.stopPropagation(); share(); }} disabled={busy}
        className={className ?? "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : message === "Link copied" ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
        {label ?? "Share"}
      </button>
      {(message || waLink) && (
        <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 max-w-[240px] truncate">
          {message && <span className="truncate">{message}</span>}
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-emerald-500 hover:text-emerald-400 flex-shrink-0">
              WhatsApp
            </a>
          )}
        </span>
      )}
    </span>
  );
}
