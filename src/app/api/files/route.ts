import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";
import { saveFile } from "@/server/storage";

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Stores one photo (proof of collection, dumping report, pickup request). The
 * body is the raw image; the browser downsizes it before upload.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED.has(mime)) return Response.json({ error: "Upload a JPEG, PNG or WebP photo." }, { status: 415 });

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) return Response.json({ error: "The photo is empty." }, { status: 400 });
    if (bytes.length > MAX_BYTES) return Response.json({ error: "Photos must be under 3 MB." }, { status: 413 });

    const companies = await visibleCompanies(session);
    const id = await saveFile({ bytes, mime, owner: session.sub, company: companies?.length === 1 ? companies[0] : null });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
