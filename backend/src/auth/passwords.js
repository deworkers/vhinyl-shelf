import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

export function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{3,40}$/.test(value);
}

export function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64, options);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = (stored || `${"0".repeat(32)}:${"0".repeat(128)}`).split(":");
  const key = await deriveKey(password, salt, 64, options);
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}
