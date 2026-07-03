import { proxyMpRequest } from '~/server/utils/proxy-request';

/**
 * 触发新一轮扫码登录会话（供 agent 调用）
 *
 * 用途：开启一个 sid，会把响应头里的 uuid cookie 透传给客户端
 *
 * 鉴权：X-Internal-Key === DEBUG_KEY（不依赖 auth-key，因为通常此时 token 已失效）
 *
 * 调用方：拿到 sid 后需自行拉取二维码：
 *   GET /api/web/login/getqrcode?rnd=<timestamp>
 *   Header: Cookie: auth-key=xxx
 */
export default defineEventHandler(async event => {
  const internalKey = getRequestHeader(event, 'X-Internal-Key');
  if (!internalKey || internalKey !== process.env.DEBUG_KEY) {
    return { code: 401, msg: 'unauthorized' };
  }

  // 生成 sid（与 components/modal/Login.vue:32 一致的格式）
  const sid = Date.now().toString() + Math.floor(Math.random() * 100);

  const body: Record<string, string | number> = {
    userlang: 'zh_CN',
    redirect_url: '',
    login_type: 3,
    sessionid: sid,
    token: '',
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  // 复用 [sid].post.ts 已有的 proxy 调用（action=start_login 触发 uuid cookie 透传）
  await proxyMpRequest({
    event,
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: { action: 'startlogin' },
    body,
    action: 'start_login',
  });

  // 把当前 host 拼成完整二维码 URL，让 agent 拿 URL 后自行下载 PNG
  const protocol = (getRequestURL(event).protocol || 'https:').replace(':', '');
  const host = getRequestHost(event);
  const qrcodeUrl = `${protocol}://${host}/api/web/login/getqrcode?rnd=${Date.now()}`;

  return {
    code: 0,
    data: {
      sid,
      qrcode_url: qrcodeUrl,
      // 二维码预期有效期，agent 应据此设置等待超时
      expires_in_seconds: 60,
    },
  };
});
