import type { Metadata } from "next";
import { PhoneSignIn } from "@/features/auth/AuthFlows";

export const metadata: Metadata = { title: "Sign in with a code" };

export default function Page() {
  return <PhoneSignIn />;
}
