/**
 * 获取登录用户信息接口
 *
 * 备注：
 * 这个接口用于后端登录成功之后调用，非客户端直接调用
 */

import { getMpProfile } from '~/server/utils/mp-profile';

export default defineEventHandler(getMpProfile);
