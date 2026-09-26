import { errorResponse, HttpError } from "@/server/session";
import { requireSettingsScope } from "@/server/settingsAccess";
import { saveFile } from "@/server/storage";

export const runtime = "nodejs";

const MAX_BYTES = 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Stores a company logo. The browser has already trimmed, cleaned and sized it
 * to a PNG, so only PNGs are accepted — which also keeps SVG (and any script
 * inside one) off our origin. Filed under the company so its clients and
 * collectors can load it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ company: string }> }) {
  try {
    const { company } = await params;
    const session = await requireSettingsScope(company);
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, "The logo is empty.");
    if (bytes.length > MAX_BYTES) throw new HttpError(413, "The processed logo must be under 1 MB.");
    if (!PNG.every((b, i) => bytes[i] === b)) throw new HttpError(415, "Logos are uploaded as PNG.");

    const id = await saveFile({ bytes, mime: "image/png", owner: session.sub, company });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
