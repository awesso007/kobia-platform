/**
 * Round 54: opaque, forever-valid recipient-owned marketing unsubscribe link.
 * A random AES-256-GCM nonce seals email+tenant, so no PII or recipient ID
 * is exposed in URL query parameters. Valid links survive broadcast removal;
 * retain prior decryption keys during rotations (comma-separated keyring).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const TENANT = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;
export type UnsubscribeIdentity = { tenant: string; email: string };

export function unsubscribeKeys(source: string | undefined = process.env.CHESS_UNSUBSCRIBE_ENCRYPTION_KEYS): Buffer[] {
  const values = (source ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!values.length || values.length > 8 || values.some(v => !/^[a-f0-9]{64}$/i.test(v)))
    return [];
  return values.map(v => Buffer.from(v, "hex"));
}
export function validUnsubscribeIdentity(tenant: unknown, rawEmail: unknown): UnsubscribeIdentity | null {
  if (typeof tenant !== "string" || !TENANT.test(tenant) ||
      typeof rawEmail !== "string") return null;
  const email = rawEmail.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? { tenant, email } : null;
}
export function sealUnsubscribeIdentity(
  tenant: string, email: string,
  keys: Buffer[] = unsubscribeKeys(),
): string | null {
  const identity = validUnsubscribeIdentity(tenant, email);
  if (!identity || !keys[0] || keys[0].length !== 32) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[0], nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ v: 1, ...identity }), "utf8"), cipher.final()]);
  return ["u1", nonce.toString("base64url"), ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url")].join(".");
}
export function openUnsubscribeIdentity(
  raw: string | null | undefined,
  keys: Buffer[] = unsubscribeKeys(),
): UnsubscribeIdentity | null {
  if (!raw || raw.length > 4096 || !/^u1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{8,1000}\.[A-Za-z0-9_-]{22}$/.test(raw))
    return null;
  const parts = raw.split(".");
  const nonce = Buffer.from(parts[1] ?? "", "base64url");
  const ciphertext = Buffer.from(parts[2] ?? "", "base64url");
  const tag = Buffer.from(parts[3] ?? "", "base64url");
  if (nonce.length !== 12 || tag.length !== 16) return null;
  for (const key of keys) {
    if (key.length !== 32) continue;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(tag);
      const json: unknown = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
      if (!json || typeof json !== "object" || Array.isArray(json)) continue;
      const row = json as Record<string, unknown>;
      if (row.v !== 1) continue;
      const identity = validUnsubscribeIdentity(row.tenant, row.email);
      if (identity && identity.email === row.email) return identity;
    } catch { /* Wrong/rotated key or tampered token. */ }
  }
  return null;
}
export function makeUnsubscribeUrl(
  tenant: string, email: string,
  base: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
  keys: Buffer[] = unsubscribeKeys(),
): string | null {
  const token = sealUnsubscribeIdentity(tenant, email, keys);
  if (!token || !base) return null;
  try {
    const url = new URL(base);
    if ((process.env.NODE_ENV === "production" && url.protocol !== "https:") ||
        !["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash) return null;
    url.pathname = "/unsubscribe";
    url.searchParams.set("cap", token);
    return url.toString();
  } catch { return null; }
}
