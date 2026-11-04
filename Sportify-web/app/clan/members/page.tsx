"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Search, ArrowLeft, Loader2, ChevronRight } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Member = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

const ROLE_CFG: Record<string, { label: string; cls: string }> = {
  admin:  { label: "Admin",  cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400" },
  coach:  { label: "Coach",  cls: "bg-blue-100   text-blue-700   dark:bg-blue-500/15   dark:text-blue-400" },
  member: { label: "Member", cls: "bg-slate-100  text-slate-600  dark:bg-white/8       dark:text-slate-400" },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CFG[role?.toLowerCase()] ?? ROLE_CFG.member;
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-lg flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>;
}

function ClanMembersWithParams() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const id          = searchParams.get("clanId") ?? "";

  const [members,     setMembers]     = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading,   setIsLoading]   = useState(true);

  useEffect(() => {
    if (!id) { setIsLoading(false); return; }
    const load = async () => {
      try {
        const res  = await fetchWithAuth(`/api/clans/get_clanmembers?clanId=${id}`);
        const data = await res.json();
        setMembers(data.success ? (data.members ?? []) : []);
      } catch { setMembers([]); }
      finally { setIsLoading(false); }
    };
    load();
  }, [id]);

  const filtered = [...members]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(m =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/clan/clandetails?clanId=${id}`)}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="display-font font-bold text-2xl text-slate-800 dark:text-white">Members</h1>
          <p className="text-xs text-slate-400">{members.length} total</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl px-3 py-2.5 shadow-sm">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white placeholder-slate-400 focus:outline-none"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1">
            Clear
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col items-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading members…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/8 p-14 text-center">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">No members found</p>
          <p className="text-sm text-slate-400">{searchQuery ? "Try a different search" : "This clan has no members yet"}</p>
        </div>
      ) : (
        <div className="sport-card overflow-hidden divide-y divide-slate-50 dark:divide-white/4">
          {filtered.map(m => {
            const isStaff = m.role?.toLowerCase() !== "member";
            return (
              <button
                key={m.user_id}
                onClick={() => router.push(`/clan/player/${m.user_id}?clanId=${id}`)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors group text-left"
              >
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isStaff ? "bg-gradient-to-br from-purple-500 to-blue-600" : "bg-gradient-to-br from-blue-500 to-teal-600"}`}>
                  <span className="text-white font-bold text-sm">{m.name.charAt(0).toUpperCase()}</span>
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-white truncate">{m.name}</p>
                  <p className="text-xs text-slate-400 truncate">{m.email}</p>
                </div>

                <RoleBadge role={m.role} />

                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-1" />
              </button>
            );
          })}
        </div>
      )}

      {/* Count footer */}
      {!isLoading && filtered.length > 0 && searchQuery && (
        <p className="text-center text-xs text-slate-400">{filtered.length} of {members.length} members</p>
      )}
    </div>
  );
}

export default function ClanMembers() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <ClanMembersWithParams />
    </Suspense>
  );
}
