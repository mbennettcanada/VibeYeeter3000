import { randomBytes, createHash } from "node:crypto";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_PREFIX = "vyt_";
const SECRET_LENGTH = 32;
// How much of the generated token is shown back to the user after creation
// (e.g. in the tokens table) so they can recognize which token is which
// without ever seeing the rest of it again.
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 8;

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE62[bytes[i]! % BASE62.length];
  }
  return out;
}

// Tokens are high-entropy random secrets, not user-chosen passwords, so a
// plain fast hash (rather than bcrypt/scrypt) is the right tool here — same
// approach GitHub/Stripe use for API tokens. There's no bcrypt dependency
// elsewhere in this package either.
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `${TOKEN_PREFIX}${randomBase62(SECRET_LENGTH)}`;
  return {
    token,
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashApiToken(token),
  };
}
