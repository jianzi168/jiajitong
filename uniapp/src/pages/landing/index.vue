<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { hasLocalSession, restoreSession, clearLocalSession } from '@/services/session'
import { toBase64 } from '@/utils/base64.js'
import { track } from '@/utils/analytics'

const restoring = ref(false)

onShow(async () => {
  // 冷启动首屏是落地页；已登录则静默进主站，无需再点「登录」
  if (!hasLocalSession() || restoring.value) return
  restoring.value = true
  try {
    const { route } = await restoreSession()
    uni.reLaunch({ url: route })
  } catch (e) {
    console.warn('[landing] restoreSession failed:', e)
    clearLocalSession()
  } finally {
    restoring.value = false
  }
})

function onQuickStart() {
  // 漏斗事件（PDD 附录 B）：访问落地页 → 开始测算
  track('calc_quick_start', { source: 'landing' })
  uni.navigateTo({ url: '/pages/quick/step1' })
}

function onFullWizard() {
  uni.navigateTo({ url: '/pages/login/index' })
}

function onPreviewHome() {
  uni.reLaunch({ url: '/pages/home/empty' })
}

const heroGraphicSrc = 'data:image/svg+xml;base64,' + toBase64(
  ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="280" height="280">',
   '<defs><linearGradient id="warmGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
   '<stop offset="0%" stop-color="#FF8A7A"/>',
   '<stop offset="50%" stop-color="#E8A0BF"/>',
   '<stop offset="100%" stop-color="#B8A4E8"/>',
   '</linearGradient></defs>',
   '<circle cx="70" cy="70" r="64" fill="url(#warmGrad)" opacity="0.18"/>',
   '<path d="M40 88 Q70 52 100 88" stroke="url(#warmGrad)" stroke-width="3" fill="none" stroke-linecap="round"/>',
   '<circle cx="52" cy="58" r="9" fill="#FF8A7A"/>',
   '<circle cx="88" cy="58" r="9" fill="#B8A4E8"/>',
   '</svg>'].join('')
)
</script>

<template>
  <view class="screen">
    <scroll-view scroll-y class="screen-body mesh-bg hero-landing">
      <text v-if="restoring" class="restoring-tip">正在恢复登录…</text>
      <template v-else>
        <image class="hero-graphic" :src="heroGraphicSrc" mode="widthFix" />
        <view class="hero-title">
          <text class="hero-title-line">刚结婚，也在想</text>
          <text class="hero-title-line">什么时候要宝宝？</text>
        </view>
        <text class="hero-sub">3 分钟测一测，看看你们小家的预算大概该是多少</text>

        <button class="grad-btn" @tap="onQuickStart">免费开始测算</button>
        <button class="grad-btn grad-btn-ghost" @tap="onFullWizard">走完整规划向导</button>
        <button class="text-link text-link-muted" @tap="onPreviewHome">先看看空态首页</button>

        <text class="trust-strip">数据加密 · 不算理财 · 不卖贷款</text>
        <text class="social-note">已有 1,024 对小夫妻生成过规划书</text>
      </template>
    </scroll-view>
  </view>
</template>

<style>
.restoring-tip {
  display: block;
  margin-top: 240rpx;
  text-align: center;
  color: var(--color-text-2);
  font-size: 28rpx;
}
</style>
