import { H3Event, parseCookies } from 'h3';
import { requirePrincipal } from '~/server/auth/session';
import { CookieKVValue, getMpCookie, registerMpCookieMemoryCache, setMpCookie } from '~/server/kv/cookie';

// 表示一条 set-cookie 记录的解析结果
export type CookieEntity = Record<string, string | number>;

// 公众号所有的 set-cookie 解析结果
export class AccountCookie {
  private readonly _token: string;
  private _cookie: CookieEntity[];

  /**
   * @param token
   * @param cookies response.headers.getSetCookie() 的结果，是一个字符串数组
   */
  constructor(token: string, cookies: string[]) {
    this._token = token;
    this._cookie = AccountCookie.parse(cookies);
  }

  static create(token: string, cookies: CookieEntity[]): AccountCookie {
    const value = new AccountCookie(token, []);
    value._cookie = cookies;
    return value;
  }

  public toString(): string {
    return this.stringify(this._cookie);
  }

  public toJSON(): CookieKVValue {
    return {
      token: this._token,
      cookies: this._cookie,
    };
  }

  public get(name: string): CookieEntity | undefined {
    return this._cookie.find(cookie => cookie.name === name);
  }

  public get token() {
    return this._token;
  }

  // 根据 cookie 中的 expires 来确定是否已过期
  public get isExpired(): boolean {
    // todo
    return false;
  }

  public static parse(cookies: string[]): CookieEntity[] {
    // key 为 cookie 的 name
    const cookieMap = new Map<string, CookieEntity>();

    for (const cookie of cookies) {
      const cookieObj: CookieEntity = {};
      // 分割 cookie 字符串为各个属性
      const parts = cookie.split(';').map(str => str.trim());

      // 第一个部分是name=value
      const [nameValue] = parts;
      if (nameValue) {
        const [name, ...valueParts] = nameValue.split('=');
        const cookieName = name.trim();
        cookieObj.name = cookieName;
        cookieObj.value = valueParts.join('=').trim(); // 处理值中可能包含的等号

        // 处理其他属性（如Expires, Path, Domain等）
        for (const part of parts.slice(1)) {
          const [key, ...valueParts] = part.split('=');
          const value = valueParts.join('=').trim(); // 处理值中可能包含的等号
          if (key) {
            const keyLower = key.toLowerCase();
            cookieObj[keyLower] = value || 'true'; // 无值属性（如HttpOnly）设为true

            // 如果是expires字段，添加时间戳
            if (keyLower === 'expires' && value) {
              try {
                const timestamp = Date.parse(value);
                if (!isNaN(timestamp)) {
                  cookieObj.expires_timestamp = timestamp; // 添加时间戳（毫秒）
                }
              } catch (e) {
                // 如果日期解析失败，忽略时间戳字段
              }
            }
          }
        }

        // Only add valid cookies to the map (overwrite if duplicate name)
        if (cookieObj.name) {
          cookieMap.set(cookieName, cookieObj);
        }
      }
    }

    return Array.from(cookieMap.values());
  }

  private stringify(parsedCookie: CookieEntity[]): string {
    return parsedCookie
      .filter(cookie => cookie.value && cookie.value !== 'EXPIRED')
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}

// 所有用户的 cookie 仓库
class CookieStore {
  // key 为 authKey, value 为 AccountCookie 实例
  // 使用 Map 的插入顺序特性实现 LRU 淘汰
  store: Map<string, AccountCookie> = new Map<string, AccountCookie>();

  // 内存缓存最大条目数，防止无限增长
  private readonly maxSize: number = 1000;

  async getAccountCookie(userId: string): Promise<AccountCookie | null> {
    // 优先从本地内存取
    let cachedAccountCookie = this.store.get(userId);

    if (cachedAccountCookie) {
      // LRU: 访问时将条目移到末尾（最近使用）
      this.store.delete(userId);
      this.store.set(userId, cachedAccountCookie);
      return cachedAccountCookie;
    }

    // 如果内存没有，则从 kv 数据库取
    const cookieValue = await getMpCookie(userId);
    if (!cookieValue) {
      return null;
    }

    cachedAccountCookie = AccountCookie.create(cookieValue.token, cookieValue.cookies);
    this.evictIfNeeded();
    this.store.set(userId, cachedAccountCookie);

    return cachedAccountCookie;
  }

  /**
   * 检索用户的cookie
   * @param authKey
   * @return 适合作为请求头的Cookie字符串
   */
  async getCookie(userId: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(userId);
    if (!accountCookie) {
      return null;
    }
    return accountCookie.toString();
  }

  /**
   * 存储用户的cookie
   * @param authKey
   * @param token
   * @param cookie 原始的 set-cookie 字符串数组
   */
  async setCookie(userId: string, token: string, cookie: string[]): Promise<boolean> {
    const accountCookie = new AccountCookie(token, cookie);
    // 如果已存在则先删除（保证 LRU 顺序正确）
    this.store.delete(userId);
    this.evictIfNeeded();
    this.store.set(userId, accountCookie);
    return await setMpCookie(userId, accountCookie.toJSON());
  }

  /**
   * 移除用户的 cookie（用于登出等场景）
   * @param authKey
   */
  removeCookie(userId: string): void {
    this.store.delete(userId);
  }

  /**
   * 当内存缓存达到上限时，淘汰最久未使用的条目
   */
  private evictIfNeeded(): void {
    while (this.store.size >= this.maxSize) {
      // Map 迭代器按插入顺序返回，第一个即为最久未使用
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * 检索用户的 token
   * @param authKey
   */
  async getToken(userId: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(userId);
    if (!accountCookie) {
      return null;
    }

    return accountCookie.token;
  }

  /**
   * 转换为 json 格式，方便存储与传输
   * 返回一个对象，键为 uuid，值为解析后的 cookie 对象
   */
  toJSON(): Record<string, AccountCookie> {
    const json: Record<string, AccountCookie> = {};
    for (const [authKey, accountCookie] of this.store) {
      json[authKey] = accountCookie;
    }
    return json;
  }
}

export const cookieStore = new CookieStore();
registerMpCookieMemoryCache(userId => cookieStore.removeCookie(userId));

/**
 * 从 CookieStore 中获取 cookie 字符串
 *
 * @description 根据经过身份验证的站点账号，从 CookieStore 中检索其微信公众号会话。
 * @param event
 */
export async function getCookieFromStore(event: H3Event): Promise<string | null> {
  return cookieStore.getCookie(requirePrincipal(event).user.id);
}

/**
 * 从 CookieStore 中获取公众号的 token
 *
 * @description 根据经过身份验证的站点账号，从 CookieStore 中检索其微信公众号 token。
 * @param event
 */
export async function getTokenFromStore(event: H3Event): Promise<string | null> {
  return cookieStore.getToken(requirePrincipal(event).user.id);
}

/**
 * 从请求中获取 cookie 字符串
 *
 * @description 用于登录过程中 uuid cookie 透传给微信
 * @param event
 */
export function getCookiesFromRequest(event: H3Event): string {
  const cookies = parseCookies(event);
  return cookies.uuid ? `uuid=${encodeURIComponent(cookies.uuid)}` : '';
}
