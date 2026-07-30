import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

// Read the secret lazily rather than importing ./env, so the seed script can use
// hashPassword() without a full server environment.
function secret(): string {
  // Lazy require avoids a circular import at module load; the value is set by
  // bootstrapSecrets() before anything signs.
  const { runtime } = require('../env') as typeof import('../env');
  const s = runtime.sessionSecret || process.env.SESSION_SECRET;
  if (!s) throw new Error('Session secret is not initialised');
  return s;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/** scrypt via node's stdlib — no bcrypt dependency to keep current. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Opaque, URL-safe token for approval links. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
