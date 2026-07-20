import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expected, ...extra] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected || extra.length) return false;

  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expectedBuffer = Buffer.from(expected, 'base64url');
  return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
}
