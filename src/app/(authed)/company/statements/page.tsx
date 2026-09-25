import type { Metadata } from "next";
import { CompanyStatements } from "@/features/company/CompanyStatements";

export const metadata: Metadata = { title: "Statements" };

export default function Page() {
  return <CompanyStatements />;
}
