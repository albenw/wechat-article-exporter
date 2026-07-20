import type { H3Event } from 'h3';
import { getUserByUsername, initializeAdmin } from '~/server/auth/account-store';
import { hashPassword, verifyPassword } from '~/server/auth/password';
import { createSession } from '~/server/auth/session';
import { toPublicUser } from '~/server/auth/types';

const LOGIN_ATTEMPT_TTL_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

interface LoginAttempt {
  failures: number;
  blockedUntil?: number;
}

function getLoginAttemptKey(event: H3Event): string {
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwardedFor || getRequestHeader(event, 'x-real-ip') || 'unknown';
  return `auth:login-attempt:${encodeURIComponent(address)}`;
}

export default defineEventHandler(async event => {
  await initializeAdmin();
  const storage = useStorage('kv');
  const attemptKey = getLoginAttemptKey(event);
  const attempt = await storage.getItem<LoginAttempt>(attemptKey);
  const retryAfter = attempt?.blockedUntil ? Math.max(0, Math.ceil((attempt.blockedUntil - Date.now()) / 1000)) : 0;
  if (retryAfter) {
    setResponseHeader(event, 'Retry-After', retryAfter);
    throw createError({ statusCode: 429, statusMessage: '尝试次数过多，请稍后再试' });
  }

  const body = await readBody<{ username?: unknown; password?: unknown }>(event);
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const user = await getUserByUsername(username);
  const valid =
    user && user.enabled
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, await hashPassword('invalid-password'));

  if (!valid || !user) {
    const failures = (attempt?.failures || 0) + 1;
    const blockedUntil =
      failures >= MAX_FAILED_LOGIN_ATTEMPTS ? Date.now() + LOGIN_ATTEMPT_TTL_SECONDS * 1000 : undefined;
    await storage.setItem(attemptKey, { failures, blockedUntil }, { ttl: LOGIN_ATTEMPT_TTL_SECONDS });
    throw createError({ statusCode: 401, statusMessage: '用户名或密码错误' });
  }

  await storage.removeItem(attemptKey);
  await createSession(event, user);
  return { authenticated: true, user: toPublicUser(user) };
});
