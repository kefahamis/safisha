import { z } from "zod";
import { findUserById } from "@/server/accessStore";
import { onboardingView, setOnboardingHidden } from "@/server/onboarding";
import { errorResponse, HttpError, requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  const session = await requireSession();
  const user = await findUserById(session.sub);
  if (!user) throw new HttpError(401, "Not signed in");
  return { session, user };
}

/** Your getting-started steps and whether you've hidden them. */
export async function GET() {
  try {
    const { session, user } = await me();
    return Response.json(await onboardingView(session, user), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ hidden: z.boolean() });

export async function POST(request: Request) {
  try {
    const { session, user } = await me();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "That request isn't valid.");
    await setOnboardingHidden(user.id, parsed.data.hidden);
    return Response.json(await onboardingView(session, user));
  } catch (err) {
    return errorResponse(err);
  }
}
