import type { Metadata } from "next";
import { StaffDesk } from "@/features/team/StaffDesk";

export const metadata: Metadata = { title: "My dashboard" };

export default function Page() {
  return <StaffDesk />;
}
