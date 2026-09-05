<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initCloud } from '@/services/cloud'
import { getCloudEnvId, BUILD_ENV } from '@/config/cloud'
import { hasLocalSession, restoreSession, clearLocalSession } from '@/services/session'
import { track, flushPending } from '@/utils/analytics'

onLaunch(() => {
  // #ifdef MP-WEIXIN
  initCloud(getCloudEnvId())
  console.log('[App] onLaunch: cloud env =', BUILD_ENV, getCloudEnvId())
  track('app_launch', { env: BUILD_ENV })
  flushPending()
  // 已登录用户：静默 bootstrap，恢复 plan，避免刷新后像「掉登录」
  if (hasLocalSession()) {
    restoreSession().catch((e) => {
      console.warn('[App] restoreSession failed:', e)
      clearLocalSession()
    })
  }
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
