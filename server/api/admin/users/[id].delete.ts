import { deleteUser } from '~/server/auth/account-store';

export default defineEventHandler(async event => {
  await deleteUser(event.context.params!.id);
  return { deleted: true };
});
