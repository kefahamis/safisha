import type { Metadata } from "next";
import { CompanySupport } from "@/features/company/CompanySupport";

export const metadata: Metadata = { title: "Care inbox · Zoa" };

export default function Page() {
  return <CompanySupport />;
}
