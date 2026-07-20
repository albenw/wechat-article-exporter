export default defineEventHandler(() => {
  throw createError({ statusCode: 410, statusMessage: 'auth-key 已废弃，请改用管理员签发的 X-API-Key' });
});
