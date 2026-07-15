import { hasAccessSession, isAccessProtectionConfigured } from '~/server/utils/access-control';

export default defineEventHandler(async event => {
  if (!isAccessProtectionConfigured(event)) {
    throw createError({ statusCode: 503, statusMessage: '站点访问保护尚未配置' });
  }

  return { authenticated: await hasAccessSession(event) };
});
