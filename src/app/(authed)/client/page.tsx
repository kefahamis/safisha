import type { Metadata } from "next";
import { ClientHome } from "@/features/client/ClientHome";

export const metadata: Metadata = { title: "My account · Zoa" };

export default function Page() {
  return <ClientHome />;
}
