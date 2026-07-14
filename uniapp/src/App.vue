<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'

onLaunch(() => {
  // #ifdef MP-WEIXIN
  // TODO(Phase 1): initCloud() — wx.cloud.init({ env, traceUser: true })
  // TODO(Phase 1): userStore().bootstrap()
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

