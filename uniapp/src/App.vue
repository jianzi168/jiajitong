<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initCloud } from '@/services/cloud'
import { getCloudEnvId, BUILD_ENV } from '@/config/cloud'
import { usePlanStore } from '@/stores/plan'
import { useSubscriptionStore } from '@/stores/subscription'

onLaunch(() => {
  // #ifdef MP-WEIXIN
  initCloud(getCloudEnvId())
  console.log('[App] onLaunch: cloud env =', BUILD_ENV, getCloudEnvId())
  // Phase 7: 拉一次当前方案, 让 home/dashboard onShow 有缓存可读
  const planStore = usePlanStore()
  planStore.loadActive().catch(() => {})
  // Phase 8: 拉一次订阅, 让 preview/full/dashboard onShow 有 entitlement 可读
  const subStore = useSubscriptionStore()
  subStore.refresh().catch(() => {})
  // #endif
  // #ifndef MP-WEIXIN
  console.warn('家计通 MVP 仅支持微信小程序，当前平台不可用')
  // #endif
})

onShow(() => {})
</script>

<template>
  <!-- App.vue 无模板内容，仅承载全局逻辑与样式 -->
</template>

<style>
@import './styles/tokens.scss';
@import './styles/common.scss';
</style>