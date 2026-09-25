import type { Metadata } from "next";
import { AdminClients } from "@/features/admin/AdminClients";

export const metadata: Metadata = { title: "Client database · Safisha" };

export default function Page() {
  return <AdminClients />;
}
