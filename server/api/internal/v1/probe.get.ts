import { requireInternalTarget } from '~/server/auth/internal-agent';
import { proxyMpRequest } from '~/server/utils/proxy-request';

/**
 * 探活接口（供 agent 调用）
 *
 * 用途：判断指定账号对应的微信 token 是否仍然有效，不返回任何微信内部数据。
 *
 * 鉴权：X-Internal-Key === DEBUG_KEY，并且必须显式传入 userId。
 *
 * 注意：实现里走了一个最便宜的微信接口 searchbiz，但只用 ret 字段判断 200003
 */
export default defineEventHandler(async event => {
  await requireInternalTarget(event);

  // probe 用最便宜的微信接口触发，仅读取 ret 字段。
  // 即使 query 里传假 token 也无所谓：proxyMpRequest 会从目标账号的真实 cookie 取出 session。
  // 该请求只要 token 失效，微信几乎必然返回 200003
  try {
    const resp: any = await proxyMpRequest({
      event,
      method: 'GET',
      endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
      query: {
        action: 'search_biz',
        begin: 0,
        count: 5,
        query: '__probe__',
        token: '__probe__',
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
      },
      parseJson: true,
    });

    const ret = resp?.base_resp?.ret;
    if (ret === 0) {
      return {
        code: 0,
        data: { valid: true, status: 'alive', checked_at: Date.now() },
      };
    }
    if (ret === 200003) {
      return {
        code: 0,
        data: { valid: false, status: 'expired', wechat_ret: 200003, err_msg: resp?.base_resp?.err_msg },
      };
    }
    return {
      code: 0,
      data: { valid: false, status: 'error', wechat_ret: ret, err_msg: resp?.base_resp?.err_msg },
    };
  } catch (e: any) {
    return {
      code: 0,
      data: { valid: false, status: 'network_error', err_msg: e?.message },
    };
  }
});
