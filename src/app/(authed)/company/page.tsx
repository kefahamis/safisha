import type { Metadata } from "next";
import { CompanyDashboard } from "@/features/company/CompanyDashboard";

export const metadata: Metadata = { title: "Dashboard · Safisha" };

export default function Page() {
  return <CompanyDashboard />;
}
