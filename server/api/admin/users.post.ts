import { createUser } from '~/server/auth/account-store';
import { toPublicUser, type UserRole } from '~/server/auth/types';

export default defineEventHandler(async event => {
  const body = await readBody<{ username?: unknown; password?: unknown; role?: unknown; enabled?: unknown }>(event);
  if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: '用户名和密码不能为空' });
  }
  const role: UserRole = body.role === 'admin' ? 'admin' : 'user';
  const user = await createUser({
    username: body.username,
    password: body.password,
    role,
    enabled: body.enabled !== false,
  });
  return { user: toPublicUser(user) };
});
