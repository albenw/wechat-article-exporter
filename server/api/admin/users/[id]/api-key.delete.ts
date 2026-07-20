import { revokeApiKey } from '~/server/auth/account-store';
import { toPublicUser } from '~/server/auth/types';

export default defineEventHandler(async event => {
  const user = await revokeApiKey(event.context.params!.id);
  return { user: toPublicUser(user) };
});
