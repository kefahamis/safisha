import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { BackupUnavailable, runBackup } from "@/server/backup";
import { refuseCron } from "@/server/cron";
import { sweepLimits } from "@/server/rateLimit";
import { moveFilesToBlob } from "@/server/storage";

export const runtime = "nodejs";
// A backup of a busy database takes a while.
export const maxDuration = 300;

/**
 * The nightly housekeeping job (netlify/functions/cron-maintenance.mts): back up the database, move any
 * photos still in the database into Blob storage, and forget old rate-limit
 * counters. Each step runs even if an earlier one fails; a failure is reported
 * (and so reaches Sentry) after the rest have had their turn.
 */
export async function POST(request: Request) {
  const refused = refuseCron(request, "maintenance");
  if (refused) return refused;

  const result: Record<string, unknown> = {};
  const failures: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (err) {
      if (err instanceof BackupUnavailable) {
        result[name] = { skipped: err.message };
        return;
      }
      console.error(`Maintenance step ${name} failed`, err);
      result[name] = { error: err instanceof Error ? err.message : String(err) };
      failures.push(name);
    }
  };

  await step("backup", runBackup);
  await step("files", async () => {
    // Several batches, within the time the job is given.
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      const r = await moveFilesToBlob(50);
      moved += r.moved;
      if (!r.more) break;
    }
    return { moved };
  });
  await step("rateLimits", sweepLimits);

  await audit(SYSTEM_ACTOR, { action: "maintenance.run", detail: result });
  if (failures.length) throw new Error(`Maintenance failed: ${failures.join(", ")}`);
  return Response.json(result);
}

export const GET = POST;
