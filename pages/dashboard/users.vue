<script setup lang="ts">
import type { SiteUser } from '~/composables/useSiteAuth';

interface AdminUser extends SiteUser {
  hasApiKey: boolean;
  createdAt: string;
}

const { user: currentUser } = useSiteAuth();
const users = ref<AdminUser[]>([]);
const loading = ref(false);
const message = ref('');
const newUsername = ref('');
const newPassword = ref('');
const newRole = ref<'admin' | 'user'>('user');
const generatedKey = ref('');

async function loadUsers() {
  loading.value = true;
  try {
    users.value = (await $fetch<{ users: AdminUser[] }>('/api/admin/users')).users;
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '无法加载账号列表';
  } finally {
    loading.value = false;
  }
}

async function createUser() {
  message.value = '';
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { username: newUsername.value, password: newPassword.value, role: newRole.value },
    });
    newUsername.value = '';
    newPassword.value = '';
    newRole.value = 'user';
    await loadUsers();
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '创建账号失败';
  }
}

async function updateUser(item: AdminUser) {
  message.value = '';
  try {
    await $fetch(`/api/admin/users/${item.id}`, {
      method: 'PATCH',
      body: { username: item.username, role: item.role, enabled: item.enabled },
    });
    await loadUsers();
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '保存账号失败';
  }
}

async function resetPassword(item: AdminUser) {
  const password = window.prompt(`为 ${item.username} 设置新密码（至少 12 位）`);
  if (!password) return;
  try {
    await $fetch(`/api/admin/users/${item.id}/password`, { method: 'POST', body: { password } });
    message.value = '密码已重置，原有登录会话已失效。';
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '重置密码失败';
  }
}

async function generateKey(item: AdminUser) {
  if (item.hasApiKey && !window.confirm('生成新 Key 会立即使旧 Key 失效，是否继续？')) return;
  try {
    const response = await $fetch<{ apiKey: string }>(`/api/admin/users/${item.id}/api-key`, { method: 'POST' });
    generatedKey.value = response.apiKey;
    await loadUsers();
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '生成 API Key 失败';
  }
}

async function revokeKey(item: AdminUser) {
  if (!window.confirm(`确定撤销 ${item.username} 的 API Key 吗？`)) return;
  await $fetch(`/api/admin/users/${item.id}/api-key`, { method: 'DELETE' });
  await loadUsers();
}

async function deleteUser(item: AdminUser) {
  if (!window.confirm(`确定永久删除 ${item.username} 吗？其 API Key 与微信公众号会话会立即失效。`)) return;
  try {
    await $fetch(`/api/admin/users/${item.id}`, { method: 'DELETE' });
    await loadUsers();
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '删除账号失败';
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="h-full overflow-auto p-6 space-y-6">
    <Teleport defer to="#title"><h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">账号管理</h1></Teleport>
    <UAlert v-if="currentUser?.role !== 'admin'" color="red" title="需要管理员权限" />
    <template v-else>
      <UCard>
        <template #header><h2 class="font-semibold">新增账号</h2></template>
        <form class="grid gap-3 md:grid-cols-4" @submit.prevent="createUser">
          <UInput v-model="newUsername" placeholder="用户名" required />
          <UInput v-model="newPassword" type="password" placeholder="初始密码（至少 12 位）" required />
          <USelect v-model="newRole" :options="[{ label: '普通用户', value: 'user' }, { label: '管理员', value: 'admin' }]" />
          <UButton type="submit" :disabled="!newUsername || !newPassword">创建</UButton>
        </form>
      </UCard>

      <UAlert v-if="message" color="red" :title="message" />
      <UAlert v-if="generatedKey" color="amber" title="请立即复制 API Key；关闭或刷新后无法再次查看。">
        <template #description><code class="break-all select-all">{{ generatedKey }}</code></template>
      </UAlert>

      <UCard>
        <template #header><div class="flex justify-between items-center"><h2 class="font-semibold">账号列表</h2><UButton size="xs" variant="ghost" :loading="loading" @click="loadUsers">刷新</UButton></div></template>
        <div class="space-y-3">
          <div v-for="item in users" :key="item.id" class="rounded border p-3 space-y-3">
            <div class="grid gap-3 md:grid-cols-4">
              <UInput v-model="item.username" />
              <USelect v-model="item.role" :options="[{ label: '普通用户', value: 'user' }, { label: '管理员', value: 'admin' }]" />
              <UCheckbox v-model="item.enabled" label="已启用" />
              <div class="flex gap-2"><UButton size="xs" @click="updateUser(item)">保存</UButton><UButton size="xs" color="amber" variant="soft" @click="resetPassword(item)">重置密码</UButton></div>
            </div>
            <div class="flex flex-wrap gap-2 items-center text-sm"><UBadge :color="item.hasApiKey ? 'green' : 'gray'">{{ item.hasApiKey ? '已签发 API Key' : '未签发 API Key' }}</UBadge><UButton size="xs" variant="soft" @click="generateKey(item)">{{ item.hasApiKey ? '轮换 API Key' : '生成 API Key' }}</UButton><UButton v-if="item.hasApiKey" size="xs" color="rose" variant="ghost" @click="revokeKey(item)">撤销 Key</UButton><UButton size="xs" color="rose" variant="ghost" @click="deleteUser(item)">删除账号</UButton></div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
