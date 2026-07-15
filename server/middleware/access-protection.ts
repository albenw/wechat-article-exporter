import { hasAccessSession, isAccessProtectionConfigured } from '~/server/utils/access-control';

const ACCESS_ROUTES = new Set(['/api/access/session']);

export default defineEventHandler(async event => {
  const pathname = getRequestURL(event).pathname;
  if (!pathname.startsWith('/api/') || ACCESS_ROUTES.has(pathname)) return;

  if (!isAccessProtectionConfigured(event)) {
    throw createError({ statusCode: 503, statusMessage: '站点访问保护尚未配置' });
  }

  if (!(await hasAccessSession(event))) {
    throw createError({ statusCode: 401, statusMessage: '需要站点访问授权' });
  }
});
