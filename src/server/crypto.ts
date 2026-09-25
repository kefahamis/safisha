// Server-only. Encrypts integration secrets at rest (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * The key comes from SETTINGS_ENCRYPTION_KEY (64 hex chars). Without it we
 * derive one from SESSION_SECRET, so a deployment that set the session secret
 * already has a stable key. Rotating either makes saved secrets unreadable —
 * they would need to be entered again.
 */
function key(): Buffer {
  const explicit = process.env.SETTINGS_ENCRYPTION_KEY;
  if (explicit) {
    const buf = Buffer.from(explicit, "hex");
    if (buf.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must be 64 hex characters");
    return buf;
  }
  const base = process.env.SESSION_SECRET;
  if (!base && process.env.NODE_ENV === "production") {
    throw new Error("Set SETTINGS_ENCRYPTION_KEY or SESSION_SECRET to store integration keys");
  }
  return createHash("sha256")
    .update(`zoa-settings:${base || "zoa-dev-secret-not-for-production-use-only"}`)
    .digest();
}

/** "v1:<iv>:<tag>:<ciphertext>", all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key (rotated) or tampered value.
    return null;
  }
}

export const randomToken = (bytes = 18) => randomBytes(bytes).toString("base64url");
