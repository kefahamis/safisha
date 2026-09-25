// Server-only. Fills an empty database with the demo world.
import { sql } from "drizzle-orm";
import { DEFAULT_ROLES } from "@/lib/auth/defaultRoles";
import { stamp } from "@/lib/format";
import { ESTATES } from "@/lib/reference/estates";
import { createInitialState } from "@/lib/seed";
import { hashPassword } from "../password";
import type { Db } from "./index";
import * as t from "./schema";

/** Every demo account shares this password; it is printed on the sign-in page. */
export const DEMO_PASSWORD = "zoa12345";

const STREAMS = ["mixed", "recyclable", "organic", "residual"] as const;

/**
 * Eight weeks of past collections on each estate's scheduled days, with
 * weights and waste streams, so trend and recycling views have history.
 */
function pickupHistory(demo: ReturnType<typeof createInitialState>) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rows: (typeof t.pickups.$inferInsert)[] = [];
  const end = new Date(2026, 8, 24);
  const start = new Date(2026, 6, 30);

  for (const c of demo.clients) {
    const truck = demo.trucks.find((x) => x.company === c.company && x.route.includes(c.estate));
    const days = ESTATES[c.estate].days;
    const base = c.type === "Business" ? 60 + c.plan / 40 : 8 + c.plan / 80;
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (!days.includes(d.getDay())) continue;
      if (rand() < 0.06) continue; // the odd missed week
      const at = new Date(d);
      at.setHours(7 + Math.floor(rand() * 6), Math.floor(rand() * 60));
      const r = rand();
      rows.push({
        client: c.id,
        when: stamp(at),
        truck: truck?.id ?? "—",
        status: "Collected",
        weightKg: Math.round(base * (0.6 + rand() * 0.8) * 10) / 10,
        stream: r < 0.5 ? "mixed" : r < 0.72 ? "recyclable" : r < 0.9 ? "organic" : STREAMS[3],
      });
    }
  }
  return rows;
}

export async function seedIfEmpty(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.roles);
  if (n > 0) return;

  const demo = createInitialState();
  const hash = hashPassword(DEMO_PASSWORD);
  const createdAt = "2026-09-01 09:00";

  const wanjiku = demo.clients[0];
  const brian = demo.clients[1];
  const grace = demo.clients.find((c) => c.name === "Grace Achieng")!;

  const user = (
    id: string,
    email: string,
    name: string,
    roleId: string,
    scope: { companyId?: string; clientId?: string; truckId?: string },
    phone: string | null = null,
  ) => ({
    id,
    email,
    phone,
    name,
    roleId,
    scope,
    grants: [],
    denies: [],
    suspended: false,
    passwordHash: hash,
    createdAt,
  });

  await db.transaction(async (tx) => {
    await tx.insert(t.roles).values(DEFAULT_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })));

    await tx.insert(t.users).values([
      user("u-wanjiku", "wanjiku@example.com", wanjiku.name, "client", { clientId: wanjiku.id }, wanjiku.phone),
      user("u-brian", "brian@example.com", brian.name, "client", { clientId: brian.id }, brian.phone),
      user("u-grace", "grace@example.com", grace.name, "client", { clientId: grace.id }, grace.phone),
      user("u-kiprop", "john.kiprop@takasafi.co.ke", "John Kiprop", "collector", {
        truckId: "KDA 412X",
        companyId: "TS",
      }),
      user("u-wairimu", "ruth.wairimu@mazingira.co.ke", "Ruth Wairimu", "collector", {
        truckId: "KDG 230Q",
        companyId: "MZ",
      }),
      user("u-ts-agent", "care@takasafi.co.ke", "Njeri Mwaura", "company_agent", { companyId: "TS" }),
      user("u-ts-admin", "ops@takasafi.co.ke", "Salim Abdalla", "company_admin", { companyId: "TS" }),
      user("u-kw-admin", "ops@kijaniwaste.co.ke", "Lydia Cheruiyot", "company_admin", { companyId: "KW" }),
      user("u-platform", "admin@zoahub.co.ke", "Achieng Odhiambo", "platform_admin", {}),
    ]);

    await tx.insert(t.clients).values(demo.clients);
    await tx
      .insert(t.clientSeq)
      .values(Object.entries(demo.seq).map(([key, value]) => ({ key, value })));
    await tx.insert(t.trucks).values(demo.trucks.map((x) => ({ ...x, lastSeen: x.lastSeen ?? null })));
    await tx.insert(t.txns).values(
      demo.txns.map((x) => ({ ...x, channel: x.channel ?? null, payer: x.payer ?? null })),
    );
    await tx.insert(t.pickups).values(pickupHistory(demo));
    await tx.insert(t.suspense).values(demo.suspense);

    for (const tk of demo.tickets) {
      await tx.insert(t.tickets).values({
        id: tk.id,
        client: tk.client,
        company: tk.company,
        cat: tk.cat,
        subject: tk.subject,
        status: tk.status,
        createdAt: tk.msgs[0]?.at ?? createdAt,
      });
      if (tk.msgs.length) {
        await tx.insert(t.ticketMessages).values(tk.msgs.map((m) => ({ ticket: tk.id, ...m })));
      }
    }

    // A couple of recycling weights and a dumping report, so the new views aren't empty.
    await tx.insert(t.dumpReports).values({
      id: "D-2001",
      reporter: brian.id,
      company: "TS",
      estate: "LAV",
      lat: -1.2771,
      lng: 36.7745,
      description: "Construction rubble and mattresses dumped by the stream behind the shops.",
      size: "large",
      status: "New",
      createdAt: "2026-09-24 17:20",
    });
  });
}
