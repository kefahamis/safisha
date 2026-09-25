import type { Metadata } from "next";
import { ClientStatement } from "@/features/client/ClientStatement";

export const metadata: Metadata = { title: "Statement · Zoa" };

export default function Page() {
  return <ClientStatement />;
}
