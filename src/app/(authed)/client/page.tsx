import type { Metadata } from "next";
import { ClientHome } from "@/features/client/ClientHome";

export const metadata: Metadata = { title: "My account · Safisha" };

export default function Page() {
  return <ClientHome />;
}
