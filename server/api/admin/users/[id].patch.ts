import { updateUser } from '~/server/auth/account-store';
import { toPublicUser, type UserRole } from '~/server/auth/types';

export default defineEventHandler(async event => {
  const body = await readBody<{ username?: unknown; role?: unknown; enabled?: unknown }>(event);
  const role: UserRole | undefined = body?.role === undefined ? undefined : body.role === 'admin' ? 'admin' : 'user';
  const user = await updateUser(event.context.params!.id, {
    username: typeof body?.username === 'string' ? body.username : undefined,
    role,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
  });
  return { user: toPublicUser(user) };
});
