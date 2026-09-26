import type { Metadata } from "next";
import { CompanySupport } from "@/features/company/CompanySupport";

export const metadata: Metadata = { title: "Chat agent" };

export default function Page() {
  return <CompanySupport />;
}
