import { v4 as uuidv4 } from 'uuid';
import { isDev, USER_AGENT } from '~/config';
import { requirePrincipal } from '~/server/auth/session';
import { RequestOptions } from '~/server/types';
import { cookieStore, getCookieFromStore } from '~/server/utils/CookieStore';
import { logRequest, logResponse } from '~/server/utils/logger';

/**
 * 代理微信公众号请求
 * @description 备注：只有登录请求(`action=login`)中的 `set-cookie` 才会被写入到 CookieStore 中
 * @param options 请求参数
 */
export async function proxyMpRequest(options: RequestOptions) {
  const headers = new Headers({
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'identity', // 禁用压缩，避免出现response.clone() bug
  });

  // 优先读取参数中的 cookie，若无则从 CookieStore 中读取
  const cookie: string | null = options.cookie || (await getCookieFromStore(options.event));
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers: headers,
    redirect: options.redirect || 'follow',
  };

  // 处理参数
  if (options.query) {
    options.endpoint += '?' + new URLSearchParams(options.query as Record<string, string>).toString();
  }
  if (options.method === 'POST' && options.body) {
    requestInit.body = new URLSearchParams(options.body as Record<string, string>).toString();
  }

  // 构造请求
  const request = new Request(options.endpoint, requestInit);

  // 记录请求报文
  const requestId = uuidv4().replace(/-/g, '');
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logRequest(requestId, request.clone());
  }

  // 转发请求
  const mpResponse = await fetch(request);

  // 记录响应报文
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logResponse(requestId, mpResponse.clone());
  }

  let setCookies: string[] = [];

  // 处理登录请求的 uuid cookie
  if (options.action === 'start_login') {
    // 提取出 uuid 这个 cookie，并透传给客户端
    setCookies = mpResponse.headers.getSetCookie().filter(cookie => cookie.startsWith('uuid='));
  }

  // 处理登录成功请求的 cookie
  // 只有登录请求才会将 Cookie 数据写入 CookieStore
  else if (options.action === 'login') {
    // 提取出 token 和 cookies
    try {
      const userId = requirePrincipal(options.event).user.id;

      const body = await mpResponse.clone().json();
      const redirectUrl = body?.redirect_url;
      if (!redirectUrl || typeof redirectUrl !== 'string') {
        throw new Error(`登录响应中未找到 redirect_url，响应内容: ${JSON.stringify(body)}`);
      }

      const token = new URL(`http://localhost${redirectUrl}`).searchParams.get('token');
      if (!token) {
        throw new Error(`redirect_url 中未找到 token 参数: ${redirectUrl}`);
      }

      const success = await cookieStore.setCookie(userId, token, mpResponse.headers.getSetCookie());
      if (!success) {
        throw new Error('cookie 写入 KV 存储失败');
      }
      setCookies = [
        // 登录成功后，删除浏览器的 uuid cookie
        'uuid=EXPIRED; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax',
      ];
    } catch (error) {
      console.error('action(login) failed:', error);

      // 登录失败时返回错误响应，而不是静默继续
      return new Response(JSON.stringify({ base_resp: { ret: -1, err_msg: `登录处理失败: ${error}` } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 构造返回给客户端的响应
  const responseHeaders = new Headers(mpResponse.headers);
  responseHeaders.delete('set-cookie');
  setCookies.forEach(setCookie => {
    responseHeaders.append('set-cookie', setCookie);
  });

  const finalResponse = new Response(mpResponse.body, {
    status: mpResponse.status,
    statusText: mpResponse.statusText,
    headers: responseHeaders,
  });

  if (!options.parseJson) {
    return finalResponse;
  } else {
    return finalResponse.json();
  }
}
