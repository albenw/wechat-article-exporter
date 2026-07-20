import { randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { getUserByApiKey, getUserById, initializeAdmin } from './account-store';
import type { AuthUser, SessionRecord } from './types';

const SESSION_COOKIE = 'app-session';
const SESSION_PREFIX = 'auth:session:';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function storage() {
  return useStorage('kv');
}

export interface RequestPrincipal {
  user: AuthUser;
  source: 'session' | 'api-key';
}

declare module 'h3' {
  interface H3EventContext {
    principal?: RequestPrincipal;
  }
}

export async function createSession(event: H3Event, user: AuthUser): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await storage().setItem<SessionRecord>(
    `${SESSION_PREFIX}${token}`,
    { userId: user.id, version: user.sessionVersion },
    { ttl: SESSION_TTL_SECONDS }
  );
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  // 迁移后不再接受或保留旧的微信公众号会话选择器。
  deleteCookie(event, 'auth-key', { path: '/' });
}

export async function clearSession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE);
  if (token) await storage().removeItem(`${SESSION_PREFIX}${token}`);
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

export async function getSessionUser(event: H3Event): Promise<AuthUser | null> {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return null;
  const session = await storage().getItem<SessionRecord>(`${SESSION_PREFIX}${token}`);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user || !user.enabled || user.sessionVersion !== session.version) return null;
  return user;
}

export async function resolveRequestPrincipal(event: H3Event): Promise<RequestPrincipal | null> {
  if (event.context.principal) return event.context.principal;
  await initializeAdmin();
  const user = await getSessionUser(event);
  if (!user) return null;
  return { user, source: 'session' };
}

export async function resolveApiPrincipal(event: H3Event): Promise<RequestPrincipal | null> {
  const apiKey = getRequestHeader(event, 'x-api-key');
  if (!apiKey) return null;
  await initializeAdmin();
  const user = await getUserByApiKey(apiKey);
  if (!user || !user.enabled) return null;
  return { user, source: 'api-key' };
}

export function requirePrincipal(event: H3Event): RequestPrincipal {
  if (!event.context.principal) throw createError({ statusCode: 401, statusMessage: '需要登录' });
  return event.context.principal;
}

export function requireAdmin(event: H3Event): RequestPrincipal {
  const principal = requirePrincipal(event);
  if (principal.user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: '需要管理员权限' });
  return principal;
}
