import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoStepSignIn } from "@/features/auth/TwoStepSignIn";

export const metadata: Metadata = { title: "Confirm it's you" };

export default function Page() {
  return (
    <Suspense>
      <TwoStepSignIn />
    </Suspense>
  );
}
