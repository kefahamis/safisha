import type { Metadata } from "next";
import { CompanyPayments } from "@/features/company/CompanyPayments";

export const metadata: Metadata = { title: "M-Pesa payments · Safisha" };

export default function Page() {
  return <CompanyPayments />;
}
