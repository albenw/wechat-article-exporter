import type { H3Event } from 'h3';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export async function getMpProfile(event: H3Event): Promise<{ nick_name: string; head_img: string; error?: string }> {
  const token = await getTokenFromStore(event);
  if (!token) return { nick_name: '', head_img: '', error: '未登录或登录已过期，请重新扫码登录' };

  const html: string = await proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/home',
    query: { t: 'home/index', token, lang: 'zh_CN' },
  }).then(response => response.text());

  const nickname = html.match(/wx\.cgiData\.nick_name\s*?=\s*?"(?<name>[^"]+)"/)?.groups?.name || '';
  const avatar = html.match(/wx\.cgiData\.head_img\s*?=\s*?"(?<avatar>[^"]+)"/)?.groups?.avatar || '';
  return { nick_name: nickname, head_img: avatar };
}
