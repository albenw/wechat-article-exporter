import { getInternalWechatLogin } from '~/server/auth/internal-agent';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const record = await getInternalWechatLogin(event, event.context.params!.sid);
  return proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/scanloginqrcode',
    query: { action: 'getqrcode', random: Date.now() },
    cookie: record.cookie,
  });
});
