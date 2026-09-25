import type { Metadata } from "next";
import { CompanyClients } from "@/features/company/CompanyClients";

export const metadata: Metadata = { title: "Clients · Zoa" };

export default function Page() {
  return <CompanyClients />;
}
