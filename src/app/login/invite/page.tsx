import type { Metadata } from "next";
import { AcceptInvite } from "@/features/auth/AuthFlows";

export const metadata: Metadata = { title: "Accept invitation" };

type Props = { searchParams: Promise<{ email?: string; token?: string }> };

export default async function Page({ searchParams }: Props) {
  const { email = "", token = "" } = await searchParams;
  return <AcceptInvite email={email} token={token} />;
}
