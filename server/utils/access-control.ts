import type { H3Event } from 'h3';

const SESSION_COOKIE = 'app-access-session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPT_TTL_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

interface LoginAttempt {
  failures: number;
  blockedUntil?: number;
}

function getAccessConfig(event: H3Event) {
  const config = useRuntimeConfig(event);
  return {
    password: config.accessPassword as string | undefined,
    secret: config.accessSecret as string | undefined,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function isEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function isAccessProtectionConfigured(event: H3Event): boolean {
  const { password, secret } = getAccessConfig(event);
  return Boolean(password && password.length >= 16 && secret && secret.length >= 32);
}

export async function verifyAccessPassword(event: H3Event, password: unknown): Promise<boolean> {
  const config = getAccessConfig(event);
  if (!config.password || !config.secret || typeof password !== 'string') return false;

  const [expected, supplied] = await Promise.all([sign(config.password, config.secret), sign(password, config.secret)]);
  return isEqual(expected, supplied);
}

export async function createAccessSession(event: H3Event): Promise<string> {
  const { password, secret } = getAccessConfig(event);
  if (!password || !secret) throw new Error('访问保护未配置');

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const passwordVersion = await sign(password, secret);
  return `${expiresAt}.${passwordVersion}.${await sign(`${expiresAt}.${passwordVersion}`, secret)}`;
}

export async function hasAccessSession(event: H3Event): Promise<boolean> {
  const { password, secret } = getAccessConfig(event);
  const session = getCookie(event, SESSION_COOKIE);
  if (!password || !secret || !session) return false;

  const [expiresAtText, passwordVersion, signature, ...extra] = session.split('.');
  const expiresAt = Number(expiresAtText);
  if (extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  const [expectedPasswordVersion, expectedSignature] = await Promise.all([
    sign(password, secret),
    sign(`${expiresAtText}.${passwordVersion}`, secret),
  ]);
  return isEqual(passwordVersion, expectedPasswordVersion) && isEqual(signature, expectedSignature);
}

export function setAccessSession(event: H3Event, session: string) {
  setCookie(event, SESSION_COOKIE, session, {
    httpOnly: true,
    maxAge: SESSION_DURATION_MS / 1000,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearAccessSession(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

function getLoginAttemptKey(event: H3Event): string {
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwardedFor || getRequestHeader(event, 'x-real-ip') || 'unknown';
  return `access-login:${encodeURIComponent(address)}`;
}

export async function getLoginRetryAfter(event: H3Event): Promise<number> {
  const attempt = await useStorage('kv').getItem<LoginAttempt>(getLoginAttemptKey(event));
  if (!attempt?.blockedUntil) return 0;
  return Math.max(0, Math.ceil((attempt.blockedUntil - Date.now()) / 1000));
}

export async function recordFailedLogin(event: H3Event): Promise<void> {
  const storage = useStorage('kv');
  const key = getLoginAttemptKey(event);
  const existing = await storage.getItem<LoginAttempt>(key);
  const failures = (existing?.failures || 0) + 1;
  const blockedUntil = failures >= MAX_FAILED_LOGIN_ATTEMPTS ? Date.now() + LOGIN_ATTEMPT_TTL_SECONDS * 1000 : undefined;
  await storage.setItem(key, { failures, blockedUntil }, { ttl: LOGIN_ATTEMPT_TTL_SECONDS });
}

export async function clearFailedLogins(event: H3Event): Promise<void> {
  await useStorage('kv').removeItem(getLoginAttemptKey(event));
}
