<script setup lang="ts">
import CodeSegment from '~/components/api/CodeSegment.vue';

const exampleKey = 'wae_your_api_key';
</script>

<template>
  <div>
    <p>
      为了方便第三方开发人员进行个性化定制，本网站将其主要功能（包括但不限于公众号查询、历史文章列表查询、文章下载等）提供
      API 以供接入。
    </p>
    <p class="text-rose-500 font-medium mt-3">
      注意：目前接入 API 免费，后续会根据实际情况动态调整，不排除会改为收费模式。
    </p>
    <p class="text-rose-500 font-medium mt-1">如果你的调用量比较大的话，推荐进行私有部署。</p>

    <UAlert class="mt-10 mb-3">
      <template #title>
        <h3 class="font-medium text-xl flex items-center space-x-2">
          <UIcon name="i-lucide:key-square" />
          <span>密钥</span>
        </h3>
      </template>

      <template #description>
        <ol class="list-decimal pl-5 text-base">
          <li>
            <p>以下所有 <code>API</code> 均需要管理员签发的 API Key，并通过请求头传递：</p>
            <CodeSegment :code="`X-API-Key: ${exampleKey}`" lang="text" class="max-w-xl mt-2" />
          </li>
          <li>
            <p>API Key 与登录会话、微信公众号扫码会话相互独立。需要微信授权的接口会使用该 Key 所属账号的微信公众号会话。</p>
          </li>
        </ol>
        <p class="mt-3 text-sm text-gray-500">请向管理员索取 Key；密钥仅会在管理员生成或轮换时显示一次。</p>
      </template>
    </UAlert>
  </div>
</template>
