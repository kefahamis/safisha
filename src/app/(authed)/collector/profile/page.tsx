import type { Metadata } from "next";
import { ProfileSettings } from "@/features/account/ProfileSettings";

export const metadata: Metadata = { title: "Profile" };

/** Everyone's own details and password, whatever their workspace. */
export default function Page() {
  return <ProfileSettings />;
}
