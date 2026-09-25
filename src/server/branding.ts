// Server-only. Each company's logo and colours, kept as the "branding" setting.
import { and, eq, inArray } from "drizzle-orm";
import { isHex, type Branding, type LogoTile } from "@/lib/branding";
import { getDb, schema } from "./db";

const { settings } = schema;
const KEY = "branding";
const TILES: LogoTile[] = ["auto", "light", "none"];

/** Branding for the given companies, keyed by company id; unbranded ones are left out. */
export async function brandingFor(companies: string[]): Promise<Record<string, Branding>> {
  if (!companies.length) return {};
  const db = await getDb();
  const rows = await db
    .select({ scope: settings.scope, config: settings.config, updatedAt: settings.updatedAt })
    .from(settings)
    .where(and(eq(settings.key, KEY), inArray(settings.scope, companies)));
  return Object.fromEntries(
    rows.map((r) => [r.scope, { ...clean(r.config), updatedAt: r.updatedAt.toISOString() }]),
  );
}

/** Keeps only well-formed fields, so a bad value can never reach a stylesheet. */
export function clean(input: Record<string, unknown>): Branding {
  const out: Branding = {};
  if (isHex(input.primary)) out.primary = input.primary.toLowerCase();
  if (isHex(input.rail)) out.rail = input.rail.toLowerCase();
  if (typeof input.logo === "string" && /^F-[A-Za-z0-9_-]{6,40}$/.test(input.logo)) out.logo = input.logo;
  if (typeof input.logoAspect === "number" && input.logoAspect > 0.1 && input.logoAspect < 12)
    out.logoAspect = Math.round(input.logoAspect * 1000) / 1000;
  if (typeof input.logoLuma === "number" && input.logoLuma >= 0 && input.logoLuma <= 1)
    out.logoLuma = Math.round(input.logoLuma * 1000) / 1000;
  if (TILES.includes(input.logoTile as LogoTile)) out.logoTile = input.logoTile as LogoTile;
  return out;
}

export async function saveBranding(company: string, branding: Branding, actor: string) {
  const db = await getDb();
  const config = { ...branding } as Record<string, unknown>;
  delete config.updatedAt;
  await db
    .insert(settings)
    .values({ scope: company, key: KEY, config, status: "ok", updatedBy: actor })
    .onConflictDoUpdate({
      target: [settings.scope, settings.key],
      set: { config, status: "ok", updatedAt: new Date(), updatedBy: actor },
    });
}

export async function clearBranding(company: string) {
  const db = await getDb();
  await db.delete(settings).where(and(eq(settings.scope, company), eq(settings.key, KEY)));
}
