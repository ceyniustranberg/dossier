import { createHash, randomBytes } from "node:crypto";

/**
 * Personal API tokens for the MCP endpoint, and the unlisted ids of dossiers. Pure helpers, kept
 * apart from the database code so the tests can run them directly.
 */

const PREFIX = "dsr_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new token: the prefix plus 32 random bytes, base64url. Shown to the user once. */
export const newToken = () => PREFIX + randomBytes(32).toString("base64url");

/** What is stored instead of the token itself. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cheap shape check before a database lookup, so junk never costs a query. */
export const looksLikeToken = (t: string | undefined): t is string => !!t && /^dsr_[A-Za-z0-9_-]{43}$/.test(t);

/**
 * A random base62 id. 22 characters carry about 131 bits, which is what keeps an unlisted
 * dossier link unguessable. Bytes of 248 and above are skipped so every character is equally likely.
 */
export function newId(length = 22): string {
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 248) out += BASE62[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const looksLikeId = (id: string) => /^[0-9A-Za-z]{16,40}$/.test(id);
