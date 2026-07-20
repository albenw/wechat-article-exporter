import { listUsers } from '~/server/auth/account-store';
import { toPublicUser } from '~/server/auth/types';

export default defineEventHandler(async () => ({ users: (await listUsers()).map(toPublicUser) }));
