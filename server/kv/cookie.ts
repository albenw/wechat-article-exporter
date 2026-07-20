import { type CookieEntity } from '~/server/utils/CookieStore';

export interface CookieKVValue {
  token: string;
  cookies: CookieEntity[];
}

function getWechatSessionKey(userId: string): string {
  return `auth:wechat:${userId}`;
}

let clearMemoryCache: ((userId: string) => void) | undefined;

export function registerMpCookieMemoryCache(clear: (userId: string) => void): void {
  clearMemoryCache = clear;
}

export async function setMpCookie(userId: string, data: CookieKVValue): Promise<boolean> {
  const kv = useStorage('kv');
  const ttl = 60 * 60 * 24 * 4; // 4 days
  try {
    await kv.set<CookieKVValue>(getWechatSessionKey(userId), data, {
      // unstorage 通用 ttl（upstash / redis 驱动识别）
      ttl,
      // Cloudflare KV 专用（cloudflare-kv-binding 驱动识别）
      // https://developers.cloudflare.com/kv/api/write-key-value-pairs/#expiring-keys
      expirationTtl: ttl,
    });
    return true;
  } catch (err) {
    console.error('kv.set call failed:', err);
    return false;
  }
}

export async function getMpCookie(userId: string): Promise<CookieKVValue | null> {
  const kv = useStorage('kv');
  return (await kv.get<CookieKVValue>(getWechatSessionKey(userId))) || null;
}

export async function deleteMpCookie(userId: string): Promise<void> {
  clearMemoryCache?.(userId);
  await useStorage('kv').removeItem(getWechatSessionKey(userId));
}
