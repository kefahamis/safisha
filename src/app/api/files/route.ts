import { visibleCompanies } from "@/server/snapshot";
import { errorResponse, requireSession } from "@/server/session";
import { saveFile } from "@/server/storage";

export const runtime = "nodejs";

const PHOTOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/**
 * Stores one photo (proof of collection, dumping report, pickup request) or a
 * PDF (a client's documents). The body is the raw file; the browser downsizes
 * photos before upload.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    const pdf = mime === "application/pdf";
    if (!PHOTOS.has(mime) && !pdf) {
      return Response.json({ error: "Upload a JPEG, PNG or WebP photo, or a PDF." }, { status: 415 });
    }

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) return Response.json({ error: "The file is empty." }, { status: 400 });
    if (pdf) {
      if (bytes.length > MAX_PDF_BYTES) return Response.json({ error: "PDFs must be under 5 MB." }, { status: 413 });
      if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) {
        return Response.json({ error: "That file isn't a PDF." }, { status: 415 });
      }
    } else if (bytes.length > MAX_PHOTO_BYTES) {
      return Response.json({ error: "Photos must be under 3 MB." }, { status: 413 });
    }

    const companies = await visibleCompanies(session);
    const id = await saveFile({ bytes, mime, owner: session.sub, company: companies?.length === 1 ? companies[0] : null });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
