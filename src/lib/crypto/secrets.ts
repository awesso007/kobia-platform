/*
 * secrets.ts (Sprint 6) - symmetric encryption for stored credentials.
 *
 * EmailAccount stores SMTP/IMAP passwords and OAuth refresh tokens. We encrypt
 * them at rest with AES-256-GCM. The key comes from env SECRETS_ENCRYPTION_KEY,
 * a 32-byte value encoded as base64.
 *
 * If the key is NOT set, encrypt/decrypt pass the value through unchanged and
 * log a one-time warning, so the app still builds and runs in dev. The email
 * settings UI surfaces a banner telling the operator to set the key before
 * connecting real accounts. We never invent or hardcode a key.
 *
 * Wire format for an encrypted value: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
 * Anything that does not start with "v1:" is treated as plaintext on decrypt,
 * which keeps values written while the key was unset readable later.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1:";
let warned = false;

function loadKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (key.length !== 32) {
    if (!warned) {
      console.warn(
        "[secrets] SECRETS_ENCRYPTION_KEY is set but is not 32 bytes (base64). Falling back to plaintext.",
      );
      warned = true;
    }
    return null;
  }
  return key;
}

function warnMissing(): void {
  if (!warned) {
    console.warn(
      "[secrets] SECRETS_ENCRYPTION_KEY not set - credentials are stored in PLAIN TEXT. Set it before connecting real accounts.",
    );
    warned = true;
  }
}

/** True when a valid 32-byte encryption key is configured. */
export function isEncryptionConfigured(): boolean {
  return loadKey() !== null;
}

/** Encrypt a plaintext string. Passes through unchanged when no key is set. */
export function encrypt(plain: string): string {
  if (plain === "") return "";
  const key = loadKey();
  if (!key) {
    warnMissing();
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Decrypt a value produced by encrypt(). Returns plaintext values unchanged. */
export function decrypt(cipherText: string): string {
  if (cipherText === "") return "";
  if (!cipherText.startsWith(PREFIX)) return cipherText; // stored as plaintext
  const key = loadKey();
  if (!key) {
    warnMissing();
    return cipherText; // cannot decrypt without the key
  }
  const parts = cipherText.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return cipherText;
  const [ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64!, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch (err) {
    console.error("[secrets] decrypt failed", err);
    return "";
  }
}
