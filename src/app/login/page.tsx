import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { DEMO_PASSWORD, listRoles, listUsers } from "@/server/accessStore";

export const metadata: Metadata = { title: "Sign in · Zoa" };

// Reads accounts from the database on each request.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const roles = await listRoles();
  const accounts = (await listUsers())
    .filter((u) => !u.suspended)
    .map((u) => ({
      email: u.email,
      name: u.name,
      role: roles.find((r) => r.id === u.roleId)?.name ?? u.roleId,
      workspace: roles.find((r) => r.id === u.roleId)?.workspace ?? "client",
    }));

  return (
    <Suspense>
      <LoginForm accounts={accounts} demoPassword={DEMO_PASSWORD} />
    </Suspense>
  );
}
