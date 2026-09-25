import type { Metadata } from "next";
import { ClientSupport } from "@/features/client/ClientSupport";

export const metadata: Metadata = { title: "Customer care · Zoa" };

export default function Page() {
  return <ClientSupport />;
}
