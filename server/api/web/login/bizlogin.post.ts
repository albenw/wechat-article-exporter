import dayjs from 'dayjs';
import { getCookiesFromRequest } from '~/server/utils/CookieStore';
import { getMpProfile } from '~/server/utils/mp-profile';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const cookie = getCookiesFromRequest(event);

  const payload: Record<string, string | number> = {
    userlang: 'zh_CN',
    redirect_url: '',
    cookie_forbidden: 0,
    cookie_cleaned: 0,
    plugin_used: 0,
    login_type: 3,
    token: '',
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  const response: Response = await proxyMpRequest({
    event: event,
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: {
      action: 'login',
    },
    body: payload,
    cookie: cookie,
    action: 'login',
  });

  const { nick_name, head_img } = await getMpProfile(event);
  if (!nick_name) {
    return {
      err: '获取公众号昵称失败，请稍后重试',
    };
  }

  const body = JSON.stringify({
    nickname: nick_name,
    avatar: head_img,
    expires: dayjs().add(4, 'days').toString(),
  });
  const headers = new Headers(response.headers);
  headers.set('Content-Length', new TextEncoder().encode(body).length.toString());
  return new Response(body, { headers: headers });
});
