import {
  clearFailedLogins,
  createAccessSession,
  getLoginRetryAfter,
  isAccessProtectionConfigured,
  recordFailedLogin,
  setAccessSession,
  verifyAccessPassword,
} from '~/server/utils/access-control';

export default defineEventHandler(async event => {
  if (!isAccessProtectionConfigured(event)) {
    throw createError({ statusCode: 503, statusMessage: '站点访问保护尚未配置' });
  }

  const retryAfter = await getLoginRetryAfter(event);
  if (retryAfter) {
    setResponseHeader(event, 'Retry-After', String(retryAfter));
    throw createError({ statusCode: 429, statusMessage: '尝试次数过多，请稍后再试' });
  }

  const body = await readBody<{ password?: unknown }>(event);
  if (!(await verifyAccessPassword(event, body?.password))) {
    await recordFailedLogin(event);
    throw createError({ statusCode: 401, statusMessage: '访问口令错误' });
  }

  await clearFailedLogins(event);
  setAccessSession(event, await createAccessSession(event));
  return { authenticated: true };
});
