import { resetUserPassword } from '~/server/auth/account-store';
import { toPublicUser } from '~/server/auth/types';

export default defineEventHandler(async event => {
  const body = await readBody<{ password?: unknown }>(event);
  if (typeof body?.password !== 'string') throw createError({ statusCode: 400, statusMessage: '密码不能为空' });
  const user = await resetUserPassword(event.context.params!.id, body.password);
  return { user: toPublicUser(user) };
});
