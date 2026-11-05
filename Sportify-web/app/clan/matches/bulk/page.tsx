"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Check, ClipboardList, Loader2, Plus, Save, ShieldAlert, Trash2, User, Users2,
} from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import RatingDelta from "@/app/components/RatingDelta";

type Member = { user_id: string; name: string; role?: string };
type MatchType = "singles" | "doubles";
type Game = { a: string; b: string };
type Row = {
  key: number;
  matchType: MatchType;
  /** singles: [a1, b1]; doubles: [a1, a2, b1, b2] by slot name */
  a1: string; a2: string; b1: string; b2: string;
  games: Game[];
};
type SavedResult = {
  submissionId: number; status?: "confirmed" | "pending"; matchId: number | null; pointsAwarded: number; ratingChanges: Record<string, number>;
};

const GAMES = 3;
const emptyGames = (): Game[] => Array.from({ length: GAMES }, () => ({ a: "", b: "" }));

/** "21-15, 18-21, 21-19" from the games that have both scores. */
function scoreOf(games: Game[]) {
  return games.filter(g => g.a !== "" && g.b !== "").map(g => `${Number(g.a)}-${Number(g.b)}`).join(", ");
}

function playersOf(r: Row) {
  return r.matchType === "singles" ? [r.a1, r.b1] : [r.a1, r.a2, r.b1, r.b2];
}

/** Same checks as parseMatchEntry on the server, so most mistakes show before saving. */
function validate(r: Row): string | null {
  const players = playersOf(r);
  if (players.some(p => !p)) return r.matchType === "singles" ? "Pick both players" : "Pick all four players";
  if (new Set(players).size !== players.length) return "A player can only appear once in a match";
  if (r.games.some(g => (g.a === "") !== (g.b === ""))) return "Enter both scores for each game played";
  if (!scoreOf(r.games)) return "Enter the score of at least one game";
  return null;
}

function winnerOf(r: Row): "a" | "b" | null {
  let a = 0, b = 0;
  for (const g of r.games) {
    if (g.a === "" || g.b === "") continue;
    if (Number(g.a) > Number(g.b)) a++;
    else if (Number(g.b) > Number(g.a)) b++;
  }
  return a > b ? "a" : b > a ? "b" : null;
}

function PlayerSelect({ value, onChange, members, taken, placeholder, invalid }: {
  value: string; onChange: (v: string) => void; members: Member[]; taken: string[]; placeholder: string; invalid: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder}
      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border bg-slate-50 dark:bg-white/5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-blue-400 transition-all ${
        invalid && !value ? "border-rose-400/60" : "border-slate-200 dark:border-white/10"}`}>
      <option value="">{placeholder}</option>
      {members.map(m => (
        <option key={m.user_id} value={m.user_id} disabled={m.user_id !== value && taken.includes(m.user_id)}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function BulkEntryContent() {
  const router = useRouter();
  const clanId = useSearchParams().get("clanId");

  const nextKey = useRef(1);
  const newRow = (matchType: MatchType = "singles"): Row => ({
    key: nextKey.current++, matchType, a1: "", a2: "", b1: "", b2: "", games: emptyGames(),
  });

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ rows: Row[]; results: SavedResult[] } | null>(null);

  useEffect(() => {
    if (!clanId) { setLoading(false); return; }
    Promise.all([
      fetchWithAuth(`/api/clans/checkadmin?clanId=${clanId}`).then(r => r.json()).catch(() => ({})),
      fetchWithAuth(`/api/clans/get_clanmembers?clanId=${clanId}`).then(r => r.json()).catch(() => ({})),
    ]).then(([admin, mem]) => {
      setAllowed(!!admin?.isAdmin);
      setMembers(Array.isArray(mem?.members) ? mem.members : []);
    }).finally(() => setLoading(false));
  }, [clanId]);

  const nameOf = (uid: string) => members.find(m => m.user_id === uid)?.name ?? "Player";

  const update = (key: number, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
    setServerErrors({});
    setFormError(null);
  };
  const setGame = (key: number, gi: number, side: "a" | "b", value: string) => {
    const clean = value.replace(/\D/g, "").slice(0, 2);
    setRows(prev => prev.map(r => r.key === key
      ? { ...r, games: r.games.map((g, i) => i === gi ? { ...g, [side]: clean } : g) }
      : r));
    setServerErrors({});
    setFormError(null);
  };
  const addRow = () => setRows(prev => [...prev, newRow(prev[prev.length - 1]?.matchType ?? "singles")]);
  const removeRow = (key: number) => { setRows(prev => prev.filter(r => r.key !== key)); setServerErrors({}); };

  const saveAll = async () => {
    if (!clanId) return;
    setShowErrors(true);
    setServerErrors({});
    setFormError(null);
    if (rows.length === 0) { setFormError("Add at least one match"); return; }
    if (rows.some(r => validate(r))) { setFormError("Fix the highlighted matches. Nothing has been saved yet."); return; }

    const matches = rows.map(r => r.matchType === "singles"
      ? { matchType: "singles", player1: r.a1, player2: r.b1, score: scoreOf(r.games) }
      : { matchType: "doubles", team1Player1: r.a1, team1Player2: r.a2, team2Player1: r.b1, team2Player2: r.b2, score: scoreOf(r.games) });

    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/clans/matches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId, matches }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const msg: string = data.error || "Couldn't save the results";
        if (typeof data.index === "number" && rows[data.index]) {
          setServerErrors({ [rows[data.index].key]: msg.replace(/^Match \d+:\s*/, "") });
          setFormError(`${msg}. Nothing was saved. Fix it and save again.`);
        } else {
          setFormError(`${msg}. Nothing was saved.`);
        }
        return;
      }
      setSaved({ rows, results: data.results ?? [] });
      setRows([newRow(rows[rows.length - 1]?.matchType ?? "singles")]);
      setShowErrors(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("Network error. Nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );

  if (!clanId || allowed === false) return (
    <div className="max-w-md mx-auto mt-10 sport-card p-8 text-center">
      <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        {clanId ? "Only a coach, clan admin or academy owner can record results for the whole group." : "No clan selected."}
      </p>
      {clanId && (
        <Link href={`/clan/matches?clanId=${clanId}`} className="inline-block mt-4 text-sm text-blue-400 underline">Back to matches</Link>
      )}
    </div>
  );

  const invalidCount = showErrors ? rows.filter(r => validate(r)).length : 0;
  const pendingCount = saved ? saved.results.filter(r => r.status === "pending").length : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-36 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back"
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="min-w-0">
          <h1 className="display-font font-bold text-2xl tracking-wide text-slate-800 dark:text-white">Record results</h1>
          <p className="text-xs text-slate-400">Enter the class&apos;s matches and save them together. They count as confirmed, except matches you played in: the other side confirms those.</p>
        </div>
      </div>

      {/* Last save */}
      {saved && (
        <div className="sport-card overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-4 h-4 text-emerald-500" />
              <p className="font-bold text-sm text-slate-800 dark:text-white">
                {saved.results.length} result{saved.results.length !== 1 ? "s" : ""} saved
              </p>
              {pendingCount > 0 && (
                <span className="text-[11px] font-semibold text-amber-500">{pendingCount} waiting for the other side</span>
              )}
              <Link href={`/clan/matches?clanId=${clanId}`} className="ml-auto text-xs font-semibold text-blue-500 hover:text-blue-400">View matches</Link>
            </div>
            <div className="space-y-2">
              {saved.rows.map((r, i) => {
                const changes = saved.results[i]?.ratingChanges ?? {};
                const side = (ids: string[]) => ids.map(u => (
                  <span key={u} className="inline-flex items-center gap-1 mr-2">
                    <span className="text-slate-700 dark:text-slate-200">{nameOf(u)}</span>
                    <RatingDelta value={changes[u]} />
                  </span>
                ));
                return (
                  <div key={r.key} className="text-xs rounded-xl bg-slate-50 dark:bg-white/4 border border-slate-100 dark:border-white/5 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-y-1">
                      {side(r.matchType === "singles" ? [r.a1] : [r.a1, r.a2])}
                      <span className="text-[10px] font-black text-slate-400 mr-2">VS</span>
                      {side(r.matchType === "singles" ? [r.b1] : [r.b1, r.b2])}
                    </div>
                    <p className="text-slate-400 font-mono mt-0.5">
                      {scoreOf(r.games)}
                      {saved.results[i]?.status === "pending" && (
                        <span className="ml-2 font-sans font-semibold text-amber-500">You played: waiting for the other side to confirm</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {members.length < 2 && (
        <div className="p-4 rounded-xl bg-amber-400/5 border border-amber-400/20 text-amber-500 text-sm">
          This group needs at least two members before you can record results.
        </div>
      )}

      {/* Rows */}
      {rows.map((r, idx) => {
        const err = serverErrors[r.key] ?? (showErrors ? validate(r) : null);
        const taken = playersOf(r).filter(Boolean);
        const winner = winnerOf(r);
        const scoreEntered = !!scoreOf(r.games);
        const slot = (name: "a1" | "a2" | "b1" | "b2", placeholder: string) => (
          <PlayerSelect value={r[name]} onChange={v => update(r.key, { [name]: v } as Partial<Row>)}
            members={members} taken={taken} placeholder={placeholder} invalid={showErrors} />
        );
        return (
          <div key={r.key} className={`sport-card overflow-hidden ${err ? "border-rose-400/50 dark:border-rose-400/40" : ""}`}>
            <div className={`h-0.5 bg-gradient-to-r ${err ? "from-rose-500 to-red-600" : "from-blue-500 to-teal-600"}`} />
            <div className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Match {idx + 1}</span>
                <div className="flex gap-1 ml-auto">
                  {(["singles", "doubles"] as MatchType[]).map(t => (
                    <button key={t} type="button" onClick={() => update(r.key, { matchType: t })}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        r.matchType === t ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-white/6 text-slate-500 dark:text-slate-400"}`}>
                      {t === "singles" ? <User className="w-3.5 h-3.5" /> : <Users2 className="w-3.5 h-3.5" />}
                      {t === "singles" ? "Singles" : "Doubles"}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove match ${idx + 1}`}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:items-center">
                <div className={`space-y-2 rounded-xl p-2 border ${winner === "a" ? "border-emerald-400/40 bg-emerald-500/5" : "border-transparent"}`}>
                  {slot("a1", r.matchType === "singles" ? "Player 1" : "Team 1 · player 1")}
                  {r.matchType === "doubles" && slot("a2", "Team 1 · player 2")}
                </div>
                <span className="text-center text-[10px] font-black tracking-widest text-slate-400">VS</span>
                <div className={`space-y-2 rounded-xl p-2 border ${winner === "b" ? "border-emerald-400/40 bg-emerald-500/5" : "border-transparent"}`}>
                  {slot("b1", r.matchType === "singles" ? "Player 2" : "Team 2 · player 1")}
                  {r.matchType === "doubles" && slot("b2", "Team 2 · player 2")}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Score (side 1 – side 2)</p>
                <div className="grid grid-cols-3 gap-2">
                  {r.games.map((g, gi) => (
                    <div key={gi} className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5">
                      <input inputMode="numeric" pattern="[0-9]*" value={g.a} placeholder={gi === 0 ? "21" : "–"}
                        aria-label={`Game ${gi + 1} side 1`}
                        onChange={e => setGame(r.key, gi, "a", e.target.value)}
                        className="w-full min-w-0 bg-transparent text-center text-base font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none" />
                      <span className="text-slate-400">-</span>
                      <input inputMode="numeric" pattern="[0-9]*" value={g.b} placeholder={gi === 0 ? "15" : "–"}
                        aria-label={`Game ${gi + 1} side 2`}
                        onChange={e => setGame(r.key, gi, "b", e.target.value)}
                        className="w-full min-w-0 bg-transparent text-center text-base font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none" />
                    </div>
                  ))}
                </div>
                {scoreEntered && !winner && !err && (
                  <p className="mt-1.5 text-xs text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> No winner from this score (a draw).
                  </p>
                )}
              </div>

              {err && (
                <p className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" onClick={addRow}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
        <Plus className="w-4 h-4" /> Add match
      </button>

      {/* Sticky save bar: courtside on a phone, keep it under the thumb */}
      {/* Sits above the mobile bottom nav; beside the sidebar on desktop */}
      <div className="fixed inset-x-0 bottom-16 md:bottom-0 md:left-64 z-40 border-t border-slate-200 dark:border-white/8 bg-white/95 dark:bg-[#0C0E21]/95 backdrop-blur px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {formError && (
            <p className="text-xs font-medium text-rose-500 dark:text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {formError}
              {invalidCount > 0 && <span className="text-slate-400">({invalidCount} to fix)</span>}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={addRow}
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
            <button type="button" onClick={saveAll} disabled={saving || rows.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : `Save all (${rows.length})`}
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 && !saved && (
        <div className="sport-card p-8 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
          <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No matches yet. Add one to start.</p>
        </div>
      )}
    </div>
  );
}

export default function BulkMatchEntryPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <BulkEntryContent />
    </Suspense>
  );
}
