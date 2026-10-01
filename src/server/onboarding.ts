// Server-only. Each person's getting-started steps, checked against what they've actually done.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Session, User } from "@/lib/auth/types";
import type { OnboardingStep, OnboardingView } from "@/lib/onboarding";
import { getDb, schema as t } from "./db";
import { securityView } from "./mfa";
import { nowStamp } from "./time";

async function settingOk(scope: string, key: string) {
  const db = await getDb();
  const [row] = await db
    .select({ status: t.settings.status })
    .from(t.settings)
    .where(and(eq(t.settings.scope, scope), eq(t.settings.key, key)));
  return row?.status === "ok";
}

async function settingSaved(scope: string, key: string) {
  const db = await getDb();
  const [row] = await db
    .select({ key: t.settings.key })
    .from(t.settings)
    .where(and(eq(t.settings.scope, scope), eq(t.settings.key, key)));
  return Boolean(row);
}

async function count(table: typeof t.clients | typeof t.companies, where?: ReturnType<typeof eq>) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row?.n ?? 0;
}

/** The steps that fit this person's account, in the order worth doing them. */
async function stepsFor(session: Session, user: User): Promise<OnboardingStep[]> {
  const db = await getDb();
  const sec = await securityView(user);
  const twoStepOffered = sec.policy.requirement !== "off";
  const twoStep: OnboardingStep = {
    key: "twoStep",
    label: "Turn on two-step sign-in",
    detail: "A second check after your password, so a leaked password isn't enough.",
    href: `/${session.ws}/security`,
    done: sec.factors.length > 0,
  };
  const photo: OnboardingStep = {
    key: "photo",
    label: "Add a profile photo",
    detail: "So colleagues and clients can put a face to your name.",
    href: `/${session.ws}/profile`,
    done: Boolean(user.photo),
  };
  const verifyEmail: OnboardingStep = {
    key: "verifyEmail",
    label: "Verify your email",
    detail: "We'll use it for password resets and important notices.",
    href: `/${session.ws}/profile`,
    done: sec.emailVerified,
  };
  const verifyPhone: OnboardingStep = {
    key: "verifyPhone",
    label: "Verify your mobile number",
    detail: "For SMS sign-in codes and password resets.",
    href: `/${session.ws}/profile`,
    done: Boolean(user.phoneVerifiedAt) || sec.factors.some((f) => f.method === "sms"),
  };

  // The platform admin: get messaging and the assistant working, then open for business.
  if (session.ws === "admin") {
    const steps: OnboardingStep[] = [];
    if (session.permissions.includes("settings.platform.manage")) {
      steps.push(
        {
          key: "sms",
          label: "Connect SMS",
          detail: "Africa's Talking, for receipts, reminders and sign-in codes.",
          href: "/admin/settings?tab=messaging",
          done: await settingOk("platform", "sms"),
        },
        {
          key: "email",
          label: "Connect email",
          detail: "Resend, for password resets, invitations and care emails.",
          href: "/admin/settings?tab=messaging",
          done: await settingOk("platform", "email"),
        },
        {
          key: "ai",
          label: "Turn on the AI assistant",
          detail: "An Anthropic key powers the care assistant and chat translation.",
          href: "/admin/settings?tab=translation",
          done: await settingOk("platform", "ai"),
        },
      );
    }
    if (session.permissions.includes("platform.companies.manage")) {
      steps.push(
        {
          key: "company",
          label: "Onboard a collection company",
          detail: "Add a licensed company and the estates it serves.",
          href: "/admin/companies",
          done: (await count(t.companies)) > 0,
        },
        {
          key: "package",
          label: "Publish a care package",
          detail: "What companies can subscribe to for SMS, email and the Tickets desk.",
          href: "/admin/packages",
          done: Boolean((await db.select({ id: t.carePackages.id }).from(t.carePackages).where(eq(t.carePackages.active, true)).limit(1))[0]),
        },
      );
    }
    if (twoStepOffered) steps.push(twoStep);
    return steps;
  }

  if (session.ws === "company") {
    const company = session.scope.companyId!;
    // Whoever runs the company: payments, clients, team, look, and care.
    if (session.permissions.includes("staff.manage")) {
      const steps: OnboardingStep[] = [];
      if (session.permissions.includes("settings.company.manage")) {
        steps.push({
          key: "mpesa",
          label: "Connect your M-Pesa Paybill",
          detail: "So clients can pay from the app and payments match themselves.",
          href: "/company/settings?tab=payments",
          done: await settingOk(company, "mpesa"),
        });
      }
      steps.push(
        {
          key: "client",
          label: "Register your first client",
          detail: "Their account number, plan and collection point.",
          href: "/company/clients",
          done: (await count(t.clients, eq(t.clients.company, company))) > 0,
        },
        {
          key: "staff",
          label: "Invite a colleague",
          detail: "Add staff to departments; each sees only what their work needs.",
          href: "/company/staff",
          done:
            ((
              await db
                .select({ n: sql<number>`count(*)::int` })
                .from(t.users)
                .where(sql`${t.users.scope}->>'companyId' = ${company}`)
            )[0]?.n ?? 0) > 1,
        },
      );
      if (session.permissions.includes("settings.company.manage")) {
        steps.push(
          {
            key: "branding",
            label: "Add your logo and colours",
            detail: "Clients see your brand in their app.",
            href: "/company/settings?tab=branding",
            done: await settingSaved(company, "branding"),
          },
          {
            key: "package",
            label: "Choose a care package",
            detail: "Add the Tickets desk and SMS and email to clients.",
            href: "/company/package",
            done: Boolean(
              (await db.select({ p: t.companies.carePackage }).from(t.companies).where(and(eq(t.companies.id, company), isNotNull(t.companies.carePackage))))[0],
            ),
          },
        );
      }
      if (twoStepOffered) steps.push(twoStep);
      return steps;
    }
    // Staff: set up their own account; agents also their sign-off.
    const steps = [photo, verifyEmail];
    if (session.permissions.includes("tickets.reply")) {
      steps.push({
        key: "signature",
        label: "Add a reply signature",
        detail: "Added under every reply you send a client.",
        href: "/company/profile",
        done: Boolean(user.signature),
      });
    }
    if (twoStepOffered) steps.push(twoStep);
    return steps;
  }

  if (session.ws === "collector") {
    const truck = session.scope.truckId;
    const checked = truck
      ? Boolean((await db.select({ id: t.inspections.id }).from(t.inspections).where(eq(t.inspections.truck, truck)).limit(1))[0])
      : true;
    const steps = [photo, verifyPhone];
    if (truck) {
      steps.push({
        key: "check",
        label: "Do your first daily vehicle check",
        detail: "Tyres, lights, brakes and fluids before you start the route.",
        href: "/collector/vehicle",
        done: checked,
      });
    }
    return steps;
  }

  // Clients: be reachable, choose their messages, and pay from the app.
  const clientId = user.scope.clientId;
  const [paid] = clientId
    ? await db
        .select({ id: t.txns.id })
        .from(t.txns)
        .where(and(eq(t.txns.client, clientId), eq(t.txns.kind, "payment")))
        .limit(1)
    : [];
  const steps: OnboardingStep[] = [
    verifyPhone,
    verifyEmail,
    {
      key: "pay",
      label: "Pay with M-Pesa",
      detail: "Pay your bill from the app; the receipt lands on your statement.",
      href: "/client/statement",
      done: Boolean(paid),
    },
  ];
  if (twoStepOffered) steps.push(twoStep);
  return steps;
}

export async function onboardingView(session: Session, user: User): Promise<OnboardingView> {
  const db = await getDb();
  const [row] = await db.select({ onboarding: t.users.onboarding }).from(t.users).where(eq(t.users.id, user.id));
  return { steps: await stepsFor(session, user), hidden: Boolean(row?.onboarding.hiddenAt) };
}

/** Hide the checklist, or bring it back from the Profile page. */
export async function setOnboardingHidden(userId: string, hidden: boolean) {
  const db = await getDb();
  await db
    .update(t.users)
    .set({ onboarding: hidden ? { hiddenAt: nowStamp() } : {} })
    .where(eq(t.users.id, userId));
}
