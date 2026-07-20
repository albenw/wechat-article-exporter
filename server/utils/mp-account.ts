import * as cheerio from 'cheerio';
import type { H3Event } from 'h3';
import { USER_AGENT } from '~/config';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

const ALLOWED_HOSTS = new Set(['mp.weixin.qq.com', 'weixin.qq.com']);

export async function getMpAccountName(rawUrl: string): Promise<string> {
  let url: string;
  try {
    url = decodeURIComponent(rawUrl);
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) throw new Error('invalid');
  } catch {
    throw createError({ statusCode: 400, statusMessage: '不允许的 URL：仅支持微信公众平台域名' });
  }

  const response = await fetch(url, {
    headers: { Referer: 'https://mp.weixin.qq.com/', Origin: 'https://mp.weixin.qq.com', 'User-Agent': USER_AGENT },
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    throw createError({
      statusCode: 502,
      statusMessage: `目标 URL 发生重定向 (status=${response.status})，已拒绝以防止 SSRF`,
    });
  }
  return cheerio
    .load(await response.text())('.wx_follow_nickname:first')
    .text()
    .trim();
}

export async function searchMpAccountByUrl(event: H3Event, url: string) {
  const name = await getMpAccountName(url);
  if (!name) return { base_resp: { ret: -1, err_msg: 'url解析公众号名称失败' } };
  const token = await getTokenFromStore(event);
  if (!token) return { base_resp: { ret: -1, err_msg: '未登录或登录已过期，请重新扫码登录' } };

  const response: any = await proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
    query: { action: 'search_biz', begin: 0, count: 20, query: name, token, lang: 'zh_CN', f: 'json', ajax: '1' },
    parseJson: true,
  });
  if (response?.base_resp?.ret !== 0) return response;

  const result = JSON.parse(JSON.stringify(response));
  result.list = (result.list || []).filter((item: any) => item.nickname === name);
  result.total = result.list.length;
  if (!result.list.length) {
    result.base_resp.ret = -1;
    result.base_resp.err_msg = '根据解析的名称搜索公众号失败';
    result.resolved_name = name;
    result.original_resp = response;
  }
  return result;
}
