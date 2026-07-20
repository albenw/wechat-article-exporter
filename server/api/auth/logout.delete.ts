import { clearSession } from '~/server/auth/session';

export default defineEventHandler(async event => {
  await clearSession(event);
  return { authenticated: false };
});
