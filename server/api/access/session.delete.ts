import { clearAccessSession } from '~/server/utils/access-control';

export default defineEventHandler(event => {
  clearAccessSession(event);
  return { authenticated: false };
});
