export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  role: UserRole;
  enabled: boolean;
  sessionVersion: number;
  apiKeyHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  enabled: boolean;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  userId: string;
  version: number;
}

export function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    enabled: user.enabled,
    hasApiKey: Boolean(user.apiKeyHash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
