import type { Metadata } from "next";
import { CompanyMap } from "@/features/company/CompanyMap";

export const metadata: Metadata = { title: "Fleet map · Zoa" };

export default function Page() {
  return <CompanyMap />;
}
