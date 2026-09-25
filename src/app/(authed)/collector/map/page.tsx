import type { Metadata } from "next";
import { CollectorMap } from "@/features/collector/CollectorMap";

export const metadata: Metadata = { title: "My location" };

export default function Page() {
  return <CollectorMap />;
}
