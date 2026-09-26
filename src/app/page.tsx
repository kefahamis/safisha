import type { Metadata } from "next";
import { PublicSite } from "@/features/site/PublicSite";
import { identity } from "@/lib/branding";
import { platformBranding } from "@/server/branding";
import { getSession } from "@/server/session";
import { siteStats } from "@/server/siteStats";
import { today } from "@/server/time";

// Live figures and the signed-in state make this per request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { full } = identity(await platformBranding());
  const description =
    "Licensed waste collection across Nairobi: pay by M-Pesa, track your truck, book pickups and report illegal dumping.";
  return {
    title: { absolute: `${full} · A cleaner Nairobi starts at your gate` },
    description,
    openGraph: { title: full, description, images: ["/site/hero-crew.jpg"] },
  };
}

/** The public website. Signed-in people get an "Open dashboard" button; /start takes them in. */
export default async function Page() {
  const [session, stats, platform] = await Promise.all([getSession(), siteStats(), platformBranding()]);
  const { name, full } = identity(platform);
  // The year in Nairobi, not the server's zone: on New Year's Eve those differ.
  const year = Number(today().slice(0, 4));
  return <PublicSite stats={stats} signedIn={Boolean(session)} name={name} fullName={full} year={year} />;
}
