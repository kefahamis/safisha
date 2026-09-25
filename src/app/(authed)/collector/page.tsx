import type { Metadata } from "next";
import { CollectorRoute } from "@/features/collector/CollectorRoute";

export const metadata: Metadata = { title: "Today’s route · Zoa" };

export default function Page() {
  return <CollectorRoute />;
}
