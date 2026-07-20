<template>
  <slot v-if="authenticated" />

  <div v-else class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold text-gray-900">账号登录</h1>
      </template>

      <form class="space-y-4" @submit.prevent="submit">
        <p class="text-sm text-gray-500">请输入管理员创建的用户名和密码。</p>
        <UInput v-model="username" autocomplete="username" placeholder="用户名" :disabled="loading" autofocus />
        <UInput v-model="password" type="password" autocomplete="current-password" placeholder="密码" :disabled="loading" />
        <p v-if="message" class="text-sm text-red-600">{{ message }}</p>
        <UButton type="submit" block :loading="loading" :disabled="!username || !password || loading">登录</UButton>
      </form>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { user, refresh } = useSiteAuth();
const authenticated = computed(() => Boolean(user.value));
const loading = ref(true);
const username = ref('');
const password = ref('');
const message = ref('');

async function checkSession() {
  loading.value = true;
  message.value = '';
  try {
    await refresh();
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '无法验证访问权限，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  loading.value = true;
  message.value = '';
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } });
    await refresh();
    username.value = '';
    password.value = '';
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '访问口令错误。';
  } finally {
    loading.value = false;
  }
}

onMounted(checkSession);
</script>
