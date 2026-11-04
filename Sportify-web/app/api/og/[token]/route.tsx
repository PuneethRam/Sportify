import { ImageResponse } from "next/og";
import { Card, loadCard, MatchCard, ProfileCard } from "@/lib/shareCards";

// GET /api/og/<token> — the rank card image (1200×630 PNG) for a share link.
// Public, so WhatsApp and other link previews can fetch it. Display names only.
export const runtime = "nodejs";

const BG = "linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)";
const ACCENT = "#a5b4fc";

const signed = (n: number | null) => (n === null ? "" : n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : "±0");

function Frame({ children, footer }: { children: React.ReactNode; footer: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: "white", padding: 56, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, color: ACCENT, letterSpacing: 2 }}>SPORTIFY</div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>{children}</div>
      <div style={{ display: "flex", fontSize: 26, color: "#cbd5e1" }}>{footer}</div>
    </div>
  );
}

function MatchImage({ c }: { c: MatchCard }) {
  const side = (players: MatchCard["team1"], won: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", opacity: won ? 1 : 0.75 }}>
      {players.map((p, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>{p.name}</div>
          {p.change !== null && (
            <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: p.change >= 0 ? "#4ade80" : "#f87171" }}>{signed(p.change)}</div>
          )}
        </div>
      ))}
      {won && <div style={{ display: "flex", fontSize: 24, color: "#fde68a", marginTop: 4 }}>WINNER</div>}
    </div>
  );
  return (
    <Frame footer={`${c.clanName} · ${c.format === "doubles" ? "Doubles" : "Singles"}`}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {side(c.team1, c.winner === "team1")}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300 }}>
          {c.games.map(([a, b], i) => (
            <div key={i} style={{ display: "flex", fontSize: 52, fontWeight: 800 }}>{`${a} - ${b}`}</div>
          ))}
        </div>
        {side(c.team2, c.winner === "team2")}
      </div>
    </Frame>
  );
}

function ProfileImage({ c }: { c: ProfileCard }) {
  const stat = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 64 }}>
      <div style={{ display: "flex", fontSize: 26, color: "#cbd5e1" }}>{label}</div>
      <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>{value}</div>
    </div>
  );
  return (
    <Frame footer={c.badge ? `${c.badge.label}${c.badge.clanName ? ` · ${c.badge.clanName}` : ""} · ${c.badge.seasonName}` : "Badminton, ranked."}>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 800, marginBottom: 28 }}>{c.name}</div>
      <div style={{ display: "flex" }}>
        {stat(`${c.format === "doubles" ? "Doubles" : "Singles"} rating`, c.provisional ? "Provisional" : String(c.rating))}
        {c.clanRank && c.clanMembers ? stat(c.clanName ?? "Clan", `#${c.clanRank} of ${c.clanMembers}`) : null}
        {stat("Weekly streak", `${c.streak} wk${c.streak === 1 ? "" : "s"}`)}
      </div>
    </Frame>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card: Card | null = await loadCard(token).catch(() => null);
  const body = !card
    ? <Frame footer="sportify"><div style={{ display: "flex", fontSize: 64, fontWeight: 800 }}>Play. Rank. Repeat.</div></Frame>
    : card.kind === "match" ? <MatchImage c={card} /> : <ProfileImage c={card} />;
  return new ImageResponse(body, {
    width: 1200,
    height: 630,
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
