import { resolveApiPrincipal, resolveRequestPrincipal } from '~/server/auth/session';

export default defineEventHandler(async event => {
  const pathname = getRequestURL(event).pathname;
  if (!pathname.startsWith('/api/') || pathname.startsWith('/api/auth/') || pathname.startsWith('/api/internal/'))
    return;
  if (pathname === '/api/public/v1/authkey') return;

  if (pathname.startsWith('/api/public/')) {
    const principal = await resolveApiPrincipal(event);
    if (!principal) throw createError({ statusCode: 401, statusMessage: '需要有效的 X-API-Key' });
    event.context.principal = principal;
    return;
  }

  const principal = await resolveRequestPrincipal(event);
  if (!principal) throw createError({ statusCode: 401, statusMessage: '需要登录' });
  if (pathname.startsWith('/api/admin/') && principal.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: '需要管理员权限' });
  }
  event.context.principal = principal;
});
