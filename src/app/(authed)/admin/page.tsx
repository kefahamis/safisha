import type { Metadata } from "next";
import { AdminOverview } from "@/features/admin/AdminOverview";

export const metadata: Metadata = { title: "City overview" };

export default function Page() {
  return <AdminOverview />;
}
