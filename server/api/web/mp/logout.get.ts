/**
 * 退出登录接口
 */

import { cookieStore, getTokenFromStore } from '~/server/utils/CookieStore';
import { requirePrincipal } from '~/server/auth/session';
import { deleteMpCookie } from '~/server/kv/cookie';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return { statusCode: 401, statusText: '未登录或登录已过期，请重新扫码登录' };
  }

  const response: Response = await proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/logout',
    query: {
      t: 'wxm-logout',
      token: token,
      lang: 'zh_CN',
    },
  });

  const userId = requirePrincipal(event).user.id;
  cookieStore.removeCookie(userId);
  await deleteMpCookie(userId);

  return {
    statusCode: response.status,
    statusText: response.statusText,
  };
});
