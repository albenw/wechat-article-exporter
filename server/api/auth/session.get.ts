import { initializeAdmin } from '~/server/auth/account-store';
import { getSessionUser } from '~/server/auth/session';
import { toPublicUser } from '~/server/auth/types';

export default defineEventHandler(async event => {
  await initializeAdmin();
  const user = await getSessionUser(event);
  return { authenticated: Boolean(user), user: user ? toPublicUser(user) : null };
});
