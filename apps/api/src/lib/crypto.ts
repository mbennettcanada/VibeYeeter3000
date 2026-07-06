import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function decrypt(payload: string, hexKey: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = Buffer.from(hexKey, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Values are tagged with how they were stored so decryptValue can tell a
// plaintext fallback (written when CONFIG_ENCRYPTION_KEY was unset) apart
// from an actually-encrypted payload, regardless of whether the key is
// present now.
export function encryptValue(plaintext: string, hexKey: string | undefined): string {
  if (!hexKey) {
    return `plain:${plaintext}`;
  }
  return `gcm:${encrypt(plaintext, hexKey)}`;
}

export function decryptValue(stored: string, hexKey: string | undefined): string {
  if (stored.startsWith("plain:")) {
    return stored.slice("plain:".length);
  }
  if (stored.startsWith("gcm:")) {
    if (!hexKey) {
      throw new Error("CONFIG_ENCRYPTION_KEY is required to decrypt this value");
    }
    return decrypt(stored.slice("gcm:".length), hexKey);
  }
  return stored;
}
