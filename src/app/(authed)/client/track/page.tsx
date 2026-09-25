import type { Metadata } from "next";
import { ClientTrack } from "@/features/client/ClientTrack";

export const metadata: Metadata = { title: "Track collector · Zoa" };

export default function Page() {
  return <ClientTrack />;
}
