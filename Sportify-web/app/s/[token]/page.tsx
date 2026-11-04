import type { Metadata } from "next";
import { Smartphone, Zap } from "lucide-react";
import { loadCard, shareUrl } from "@/lib/shareCards";

// Landing page for a shared rank card: https://<app>/s/<token>.
// The card is the Open Graph image, so WhatsApp shows it in the preview.
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL;

type Props = { params: Promise<{ token: string }> };

async function describe(token: string) {
  const card = await loadCard(token).catch(() => null);
  if (!card) return { card, title: "Sportify", description: "Ranked badminton for clubs and academies." };
  if (card.kind === "match") {
    const t1 = card.team1.map(p => p.name).join(" & ");
    const t2 = card.team2.map(p => p.name).join(" & ");
    const score = card.games.map(([a, b]) => `${a}-${b}`).join(", ");
    return { card, title: `${t1} vs ${t2} · ${score}`, description: `A ${card.format} result in ${card.clanName} on Sportify.` };
  }
  const rating = card.provisional ? "Provisional rating" : `Rated ${card.rating}`;
  const rank = card.clanRank && card.clanName ? ` · #${card.clanRank} in ${card.clanName}` : "";
  return { card, title: `${card.name} on Sportify`, description: `${rating}${rank} · ${card.streak}-week streak` };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const { title, description } = await describe(token);
  const image = shareUrl(token).replace("/s/", "/api/og/");
  return {
    title,
    description,
    openGraph: { title, description, url: shareUrl(token), images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const { card, title, description } = await describe(token);
  const join = card?.inviteToken ? `/i/${card.inviteToken}` : "/auth/signup";

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 fill-white text-white" />
          </div>
          <span className="display-font font-bold text-2xl tracking-wide text-white">
            SPORT<span className="text-blue-400">IFY</span>
          </span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
          {card ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/og/${token}`} alt={title} width={1200} height={630} className="w-full h-auto rounded-xl mb-4" />
              <h1 className="text-xl font-bold text-white mb-1">{title}</h1>
              <p className="text-slate-300 mb-5">{description}</p>
            </>
          ) : (
            <p className="text-center text-slate-300 py-6">This card isn&apos;t available any more.</p>
          )}
          <a href={join}
            className="block text-center w-full p-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition">
            {card?.inviteToken ? `Join ${card.kind === "match" ? card.clanName : card.clanName ?? "Sportify"}` : "Join Sportify"}
          </a>
          <p className="text-center text-sm text-slate-400 mt-3">Get a rating, keep a streak, win the season.</p>
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
