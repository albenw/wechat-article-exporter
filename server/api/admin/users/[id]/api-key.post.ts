import { generateApiKey } from '~/server/auth/account-store';
import { toPublicUser } from '~/server/auth/types';

export default defineEventHandler(async event => {
  const { user, apiKey } = await generateApiKey(event.context.params!.id);
  return { user: toPublicUser(user), apiKey };
});
