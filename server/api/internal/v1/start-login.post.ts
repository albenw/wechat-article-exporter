import { randomUUID } from 'node:crypto';
import { requireInternalTarget, saveInternalWechatLogin } from '~/server/auth/internal-agent';
import { proxyMpRequest } from '~/server/utils/proxy-request';

/**
 * 触发新一轮扫码登录会话（供 agent 调用）
 *
 * 用途：为指定站点账号开启一轮短期扫码会话。
 *
 * 鉴权：X-Internal-Key === DEBUG_KEY，并且必须显式传入 userId。
 *
 * 调用方：使用返回的 qrcode_url、scan_url 和 complete_url 完成扫码；所有请求均需携带 DEBUG_KEY 和 userId。
 */
export default defineEventHandler(async event => {
  const principal = await requireInternalTarget(event);

  // 生成短期扫码会话 ID
  const sid = randomUUID();

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

  // action=start_login 会取得微信 uuid cookie，随后仅保存到服务端短期会话。
  const response: Response = await proxyMpRequest({
    event,
    method: 'POST',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/bizlogin',
    query: { action: 'startlogin' },
    body,
    action: 'start_login',
  });

  const uuidCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('uuid='));
  if (!uuidCookie) throw createError({ statusCode: 502, statusMessage: '微信登录会话初始化失败' });
  await saveInternalWechatLogin(sid, { userId: principal.user.id, cookie: uuidCookie.split(';', 1)[0] });

  // 把当前 host 拼成完整二维码 URL，让 agent 拿 URL 后自行下载 PNG
  const protocol = (getRequestURL(event).protocol || 'https:').replace(':', '');
  const host = getRequestHost(event);
  const qrcodeUrl = `${protocol}://${host}/api/internal/v1/login/${sid}/qrcode?userId=${encodeURIComponent(principal.user.id)}`;

  return {
    code: 0,
    data: {
      sid,
      user_id: principal.user.id,
      qrcode_url: qrcodeUrl,
      scan_url: `${protocol}://${host}/api/internal/v1/login/${sid}/scan?userId=${encodeURIComponent(principal.user.id)}`,
      complete_url: `${protocol}://${host}/api/internal/v1/login/${sid}/complete?userId=${encodeURIComponent(principal.user.id)}`,
      // 二维码预期有效期，agent 应据此设置等待超时
      expires_in_seconds: 60,
    },
  };
});
