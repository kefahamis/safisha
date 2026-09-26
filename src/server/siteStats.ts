// Server-only. Real figures for the public website — nothing on it is made up.
import { and, eq, gte, sql } from "drizzle-orm";
import { DEFAULT_PRICES, PICKUP_KINDS } from "@/lib/integrations";
import { COMPANIES } from "@/lib/reference/companies";
import { ESTATES } from "@/lib/reference/estates";
import { getDb, schema } from "./db";
import { loadSetting } from "./settings";
import { nowStamp } from "./time";

const t = schema;

export interface SiteStats {
  clients: number;
  companies: number;
  estates: number;
  trucks: number;
  trucksOnRoute: number;
  /** Last 30 days of proof-of-collection. */
  pickups30: number;
  tonnes30: number;
  /** Share of weighed waste that was recyclable or organic, 0–100. */
  divertedPct: number;
  /** Stops completed, of those attempted, 0–100; absent until there's enough to go on. */
  completionPct?: number;
  /** Cheapest on-demand pickup, for "from KES …". */
  pickupFrom: number;
  pickupKinds: { label: string; price: number }[];
  ussdCode?: string;
}

export async function siteStats(): Promise<SiteStats> {
  const db = await getDb();
  const since = nowStamp(new Date(Date.now() - 30 * 86_400_000));
  const [[clients], [trucks], [pickups], [stops], ussd] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(t.clients),
    db
      .select({
        n: sql<number>`count(*)::int`,
        live: sql<number>`count(*) filter (where ${t.trucks.status} <> 'offline' and ${t.trucks.sharing})::int`,
      })
      .from(t.trucks),
    db
      .select({
        n: sql<number>`count(*)::int`,
        kg: sql<number>`coalesce(sum(${t.pickups.weightKg}), 0)`,
        diverted: sql<number>`coalesce(sum(${t.pickups.weightKg}) filter (where ${t.pickups.stream} in ('recyclable','organic')), 0)`,
      })
      .from(t.pickups)
      .where(and(eq(t.pickups.status, "Collected"), gte(t.pickups.when, since))),
    db
      .select({
        n: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${t.stops.status} = 'Collected')::int`,
      })
      .from(t.stops),
    loadSetting("platform", "ussd").catch(() => null),
  ]);

  const kg = Number(pickups.kg);
  const prices = PICKUP_KINDS.map((k) => ({ label: k.label, price: DEFAULT_PRICES[k.key] ?? 0 })).filter((k) => k.price > 0);
  const code = ussd?.config?.serviceCode;
  return {
    clients: clients.n,
    companies: COMPANIES.length,
    estates: Object.keys(ESTATES).length,
    trucks: trucks.n,
    trucksOnRoute: Number(trucks.live),
    pickups30: pickups.n,
    tonnes30: Math.round(kg / 100) / 10,
    divertedPct: kg ? Math.round((Number(pickups.diverted) / kg) * 100) : 0,
    // A handful of stops says little; leave the figure out rather than guess.
    completionPct: stops.n >= 20 ? Math.round((stops.done / stops.n) * 100) : undefined,
    pickupFrom: prices.length ? Math.min(...prices.map((p) => p.price)) : 0,
    pickupKinds: prices,
    ussdCode: typeof code === "string" && code.trim() ? code.trim() : undefined,
  };
}
