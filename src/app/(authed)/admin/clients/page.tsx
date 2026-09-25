import type { Metadata } from "next";
import { AdminClients } from "@/features/admin/AdminClients";

export const metadata: Metadata = { title: "Client database" };

export default function Page() {
  return <AdminClients />;
}
