<template>
  <slot v-if="authenticated" />

  <div v-else class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold text-gray-900">私有访问</h1>
      </template>

      <form class="space-y-4" @submit.prevent="submit">
        <p class="text-sm text-gray-500">请输入访问口令以使用此站点。</p>
        <UInput v-model="password" type="password" autocomplete="current-password" placeholder="访问口令" :disabled="loading" autofocus />
        <p v-if="message" class="text-sm text-red-600">{{ message }}</p>
        <UButton type="submit" block :loading="loading" :disabled="!password || loading">进入</UButton>
      </form>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const authenticated = ref(false);
const loading = ref(true);
const password = ref('');
const message = ref('');

async function checkSession() {
  loading.value = true;
  message.value = '';
  try {
    const response = await $fetch<{ authenticated: boolean }>('/api/access/session');
    authenticated.value = response.authenticated;
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
    await $fetch('/api/access/session', { method: 'POST', body: { password: password.value } });
    authenticated.value = true;
    password.value = '';
  } catch (error: any) {
    message.value = error?.data?.statusMessage || '访问口令错误。';
  } finally {
    loading.value = false;
  }
}

onMounted(checkSession);
</script>
