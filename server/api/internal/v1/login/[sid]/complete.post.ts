import { clearInternalWechatLogin, getInternalWechatLogin } from '~/server/auth/internal-agent';
import { getMpProfile } from '~/server/utils/mp-profile';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const sid = event.context.params!.sid;
  const record = await getInternalWechatLogin(event, sid);
  const response: Response = await proxyMpRequest({
    event,
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: { action: 'login' },
    body: {
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
    },
    cookie: record.cookie,
    action: 'login',
  });
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: '微信登录失败' });
  await clearInternalWechatLogin(sid);
  return getMpProfile(event);
});
