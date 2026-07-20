import { H3Event } from 'h3';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  event: H3Event;
  endpoint: string;
  method: Method;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, string | number | undefined>;
  parseJson?: boolean;
  cookie?: string;
  referer?: string;
  redirect?: RequestRedirect;

  /**
   * start_login: 开始登录流程 (把微信原始响应中的 uuid 这个 set-cookie 传递给客户端，以便后续扫码登录用)
   * login: 登录流程完成（把微信响应的 cookie/token 保存到当前站点账号的会话中）
   */
  action?: 'start_login' | 'login';
}
