import type { Metadata } from "next";
import { AdminMap } from "@/features/admin/AdminMap";

export const metadata: Metadata = { title: "City map · Zoa" };

export default function Page() {
  return <AdminMap />;
}
