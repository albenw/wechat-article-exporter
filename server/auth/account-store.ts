import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CookieKVValue } from '~/server/kv/cookie';
import { deleteMpCookie, setMpCookie } from '~/server/kv/cookie';
import { hashPassword } from './password';
import type { AuthUser, UserRole } from './types';
import { withAccountWriteLock } from './write-lock';

const USER_PREFIX = 'auth:user:';
const USERNAME_PREFIX = 'auth:username:';
const API_KEY_PREFIX = 'auth:api-key:';
const LEGACY_WECHAT_KEY = 'cookie:self-hosted';

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  enabled?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  role?: UserRole;
  enabled?: boolean;
}

function storage() {
  return useStorage('kv');
}

function now() {
  return new Date().toISOString();
}

function userKey(id: string) {
  return `${USER_PREFIX}${id}`;
}

function usernameKey(normalizedUsername: string) {
  return `${USERNAME_PREFIX}${encodeURIComponent(normalizedUsername)}`;
}

function hashApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): boolean {
  return /^[A-Za-z0-9._-]{3,32}$/.test(username);
}

export function validatePassword(password: string): boolean {
  return password.length >= 12;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  return (await storage().getItem<AuthUser>(userKey(id))) || null;
}

export async function getUserByUsername(username: string): Promise<AuthUser | null> {
  const id = await storage().getItem<string>(usernameKey(normalizeUsername(username)));
  return id ? getUserById(id) : null;
}

export async function listUsers(): Promise<AuthUser[]> {
  const keys = await storage().getKeys(USER_PREFIX);
  const users = await Promise.all(keys.map(key => storage().getItem<AuthUser>(key)));
  return users
    .filter((user): user is AuthUser => Boolean(user && user.id))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function saveUser(user: AuthUser): Promise<void> {
  await storage().setItem(userKey(user.id), user);
}

export async function initializeAdmin(): Promise<void> {
  if ((await listUsers()).length) return;
  return withAccountWriteLock(initializeAdminUnlocked);
}

async function initializeAdminUnlocked(): Promise<void> {
  if ((await listUsers()).length) return;

  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password || !validatePassword(password)) {
    console.error('未找到可用的 APP_ACCESS_PASSWORD，无法初始化管理员账号');
    return;
  }

  let user: AuthUser;
  try {
    user = await createUserUnlocked({ username: 'admin', password, role: 'admin' });
  } catch (error: any) {
    if (error?.statusCode === 409) return;
    throw error;
  }

  const legacyWechatSession = await storage().getItem<CookieKVValue>(LEGACY_WECHAT_KEY);
  if (legacyWechatSession) {
    await setMpCookie(user.id, legacyWechatSession);
    await storage().removeItem(LEGACY_WECHAT_KEY);
  }
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  return withAccountWriteLock(() => createUserUnlocked(input));
}

async function createUserUnlocked(input: CreateUserInput): Promise<AuthUser> {
  if (!validateUsername(input.username)) throw createError({ statusCode: 400, statusMessage: '用户名格式不正确' });
  if (!validatePassword(input.password)) throw createError({ statusCode: 400, statusMessage: '密码至少需要 12 位' });

  const normalizedUsername = normalizeUsername(input.username);
  if (await storage().getItem(usernameKey(normalizedUsername))) {
    throw createError({ statusCode: 409, statusMessage: '用户名已存在' });
  }

  const createdAt = now();
  const user: AuthUser = {
    id: randomUUID(),
    username: input.username.trim(),
    normalizedUsername,
    passwordHash: await hashPassword(input.password),
    role: input.role || 'user',
    enabled: input.enabled ?? true,
    sessionVersion: 1,
    createdAt,
    updatedAt: createdAt,
  };
  await saveUser(user);
  await storage().setItem(usernameKey(normalizedUsername), user.id);
  if ((await storage().getItem<string>(usernameKey(normalizedUsername))) !== user.id) {
    await storage().removeItem(userKey(user.id));
    throw createError({ statusCode: 409, statusMessage: '用户名已存在' });
  }
  return user;
}

async function enabledAdminCount(): Promise<number> {
  return (await listUsers()).filter(user => user.role === 'admin' && user.enabled).length;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AuthUser> {
  return withAccountWriteLock(() => updateUserUnlocked(id, input));
}

async function updateUserUnlocked(id: string, input: UpdateUserInput): Promise<AuthUser> {
  const user = await getUserById(id);
  if (!user) throw createError({ statusCode: 404, statusMessage: '账号不存在' });

  const nextRole = input.role ?? user.role;
  const nextEnabled = input.enabled ?? user.enabled;
  if (
    user.role === 'admin' &&
    user.enabled &&
    (nextRole !== 'admin' || !nextEnabled) &&
    (await enabledAdminCount()) <= 1
  ) {
    throw createError({ statusCode: 400, statusMessage: '至少需要保留一个启用的管理员账号' });
  }

  if (input.username !== undefined) {
    if (!validateUsername(input.username)) throw createError({ statusCode: 400, statusMessage: '用户名格式不正确' });
    const normalizedUsername = normalizeUsername(input.username);
    const ownerId = await storage().getItem<string>(usernameKey(normalizedUsername));
    if (ownerId && ownerId !== user.id) throw createError({ statusCode: 409, statusMessage: '用户名已存在' });
    if (normalizedUsername !== user.normalizedUsername) {
      await storage().setItem(usernameKey(normalizedUsername), user.id);
      if ((await storage().getItem<string>(usernameKey(normalizedUsername))) !== user.id) {
        throw createError({ statusCode: 409, statusMessage: '用户名已存在' });
      }
      await storage().removeItem(usernameKey(user.normalizedUsername));
      user.normalizedUsername = normalizedUsername;
    }
    user.username = input.username.trim();
  }

  user.role = nextRole;
  user.enabled = nextEnabled;
  if (!nextEnabled) user.sessionVersion += 1;
  user.updatedAt = now();
  await saveUser(user);
  return user;
}

export async function resetUserPassword(id: string, password: string): Promise<AuthUser> {
  return withAccountWriteLock(() => resetUserPasswordUnlocked(id, password));
}

async function resetUserPasswordUnlocked(id: string, password: string): Promise<AuthUser> {
  if (!validatePassword(password)) throw createError({ statusCode: 400, statusMessage: '密码至少需要 12 位' });
  const user = await getUserById(id);
  if (!user) throw createError({ statusCode: 404, statusMessage: '账号不存在' });
  user.passwordHash = await hashPassword(password);
  user.sessionVersion += 1;
  user.updatedAt = now();
  await saveUser(user);
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  return withAccountWriteLock(() => deleteUserUnlocked(id));
}

async function deleteUserUnlocked(id: string): Promise<void> {
  const user = await getUserById(id);
  if (!user) throw createError({ statusCode: 404, statusMessage: '账号不存在' });
  if (user.role === 'admin' && user.enabled && (await enabledAdminCount()) <= 1) {
    throw createError({ statusCode: 400, statusMessage: '至少需要保留一个启用的管理员账号' });
  }

  await Promise.all([
    storage().removeItem(userKey(user.id)),
    storage().removeItem(usernameKey(user.normalizedUsername)),
    user.apiKeyHash ? storage().removeItem(`${API_KEY_PREFIX}${user.apiKeyHash}`) : Promise.resolve(),
    deleteMpCookie(user.id),
  ]);
}

export async function generateApiKey(id: string): Promise<{ user: AuthUser; apiKey: string }> {
  return withAccountWriteLock(() => generateApiKeyUnlocked(id));
}

async function generateApiKeyUnlocked(id: string): Promise<{ user: AuthUser; apiKey: string }> {
  const user = await getUserById(id);
  if (!user) throw createError({ statusCode: 404, statusMessage: '账号不存在' });
  const apiKey = `wae_${randomBytes(32).toString('base64url')}`;
  const apiKeyHash = hashApiKey(apiKey);
  await Promise.all([
    user.apiKeyHash ? storage().removeItem(`${API_KEY_PREFIX}${user.apiKeyHash}`) : Promise.resolve(),
    storage().setItem(`${API_KEY_PREFIX}${apiKeyHash}`, user.id),
  ]);
  user.apiKeyHash = apiKeyHash;
  user.updatedAt = now();
  await saveUser(user);
  return { user, apiKey };
}

export async function revokeApiKey(id: string): Promise<AuthUser> {
  return withAccountWriteLock(() => revokeApiKeyUnlocked(id));
}

async function revokeApiKeyUnlocked(id: string): Promise<AuthUser> {
  const user = await getUserById(id);
  if (!user) throw createError({ statusCode: 404, statusMessage: '账号不存在' });
  if (user.apiKeyHash) await storage().removeItem(`${API_KEY_PREFIX}${user.apiKeyHash}`);
  delete user.apiKeyHash;
  user.updatedAt = now();
  await saveUser(user);
  return user;
}

export async function getUserByApiKey(apiKey: string): Promise<AuthUser | null> {
  const apiKeyHash = hashApiKey(apiKey);
  const id = await storage().getItem<string>(`${API_KEY_PREFIX}${apiKeyHash}`);
  const user = id ? await getUserById(id) : null;
  return user?.apiKeyHash === apiKeyHash ? user : null;
}
