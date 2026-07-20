import type { H3Event } from 'h3';
import { getUserById } from '~/server/auth/account-store';
import type { RequestPrincipal } from '~/server/auth/session';

const INTERNAL_LOGIN_PREFIX = 'auth:internal-wechat-login:';
const INTERNAL_LOGIN_TTL_SECONDS = 5 * 60;

export interface InternalWechatLogin {
  userId: string;
  cookie: string;
}

export async function requireInternalTarget(event: H3Event): Promise<RequestPrincipal> {
  const internalKey = getRequestHeader(event, 'x-internal-key');
  if (!internalKey || internalKey !== process.env.DEBUG_KEY) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' });
  }
  const userId = getQuery<{ userId?: string }>(event).userId;
  if (!userId) throw createError({ statusCode: 400, statusMessage: '需要 userId 参数' });
  const user = await getUserById(userId);
  if (!user || !user.enabled) throw createError({ statusCode: 404, statusMessage: '目标账号不存在或已禁用' });
  const principal: RequestPrincipal = { user, source: 'session' };
  event.context.principal = principal;
  return principal;
}

export async function saveInternalWechatLogin(sid: string, value: InternalWechatLogin): Promise<void> {
  await useStorage('kv').setItem(`${INTERNAL_LOGIN_PREFIX}${sid}`, value, { ttl: INTERNAL_LOGIN_TTL_SECONDS });
}

export async function getInternalWechatLogin(event: H3Event, sid: string): Promise<InternalWechatLogin> {
  const principal = await requireInternalTarget(event);
  const record = await useStorage('kv').getItem<InternalWechatLogin>(`${INTERNAL_LOGIN_PREFIX}${sid}`);
  if (!record || record.userId !== principal.user.id)
    throw createError({ statusCode: 404, statusMessage: '扫码会话不存在或已过期' });
  return record;
}

export async function clearInternalWechatLogin(sid: string): Promise<void> {
  await useStorage('kv').removeItem(`${INTERNAL_LOGIN_PREFIX}${sid}`);
}
