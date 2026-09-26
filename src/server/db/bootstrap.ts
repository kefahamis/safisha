// Server-only. The first platform admin of a real (non-demo) deployment.
import { eq } from "drizzle-orm";
import { hashPassword } from "../password";
import { nowStamp } from "../time";
import type { Db } from "./index";
import * as t from "./schema";

/**
 * Without demo data a fresh database has nobody who can sign in. Set
 * ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) for the first deploy and a
 * platform admin is created, once, while none exists. That admin onboards
 * companies and invites everyone else; after that the variables can be
 * removed, and changing them never touches an existing account.
 */
export async function bootstrapAdmin(db: Db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email) return;

  const [existing] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.roleId, "platform_admin")).limit(1);
  if (existing) return;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("ADMIN_EMAIL isn't a valid email address; no platform admin was created.");
    return;
  }
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters; no platform admin was created.");
    return;
  }

  await db
    .insert(t.users)
    .values({
      id: `u-admin-${Date.now().toString(36)}`,
      email,
      name: process.env.ADMIN_NAME?.trim() || "Platform admin",
      roleId: "platform_admin",
      scope: {},
      grants: [],
      denies: [],
      passwordHash: hashPassword(password),
      createdAt: nowStamp(),
    })
    .onConflictDoNothing();
  console.info(`Created the platform admin ${email}.`);
}
