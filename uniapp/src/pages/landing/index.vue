<script setup>
function onQuickStart() {
  uni.navigateTo({ url: '/pages/quick/step1' })
}

function onFullWizard() {
  uni.navigateTo({ url: '/pages/login/index' })
}

function onPreviewHome() {
  uni.reLaunch({ url: '/pages/home/empty' })
}

const heroGraphicSrc = 'data:image/svg+xml;utf8,' + encodeURIComponent(
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
    <view class="screen-body mesh-bg hero-landing">
      <image class="hero-graphic" :src="heroGraphicSrc" mode="widthFix" />
      <text class="hero-title">刚结婚，也在想
什么时候要宝宝？</text>
      <text class="hero-sub">3 分钟测一测，看看你们小家的预算大概该是多少</text>

      <button class="grad-btn" @tap="onQuickStart">免费开始测算</button>
      <button class="grad-btn grad-btn-ghost" @tap="onFullWizard">走完整规划向导</button>
      <button class="text-link text-link-muted" @tap="onPreviewHome">先看看空态首页</button>

      <text class="trust-strip">数据加密 · 不算理财 · 不卖贷款</text>
      <text class="social-note">已有 1,024 对小夫妻生成过规划书</text>
    </view>
  </view>
</template>

<style>
</style>
