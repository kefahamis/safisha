import type { Metadata } from "next";
import { SecuritySettings } from "@/features/account/SecuritySettings";

export const metadata: Metadata = { title: "Security" };

/** Everyone's own sign-in security, whatever their workspace. */
export default function Page() {
  return <SecuritySettings />;
}
