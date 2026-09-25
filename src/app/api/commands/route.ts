import type { Command } from "@/lib/commands";
import { runCommand } from "@/server/commands";
import { buildSnapshot } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";

export const runtime = "nodejs";

/** Applies one command and answers with its result and a fresh snapshot. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    let cmd: Command;
    try {
      cmd = (await request.json()) as Command;
    } catch {
      return Response.json({ error: "Expected a JSON command." }, { status: 400 });
    }
    if (!cmd || typeof cmd.type !== "string") {
      return Response.json({ error: "Expected a command type." }, { status: 400 });
    }
    const result = await runCommand(session, cmd);
    const snapshot = await buildSnapshot(session);
    return Response.json({ result, snapshot }, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
