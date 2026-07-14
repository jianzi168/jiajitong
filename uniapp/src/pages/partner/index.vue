<script setup>
import NavBar from '@/components/NavBar.vue'
import { toBase64 } from '@/utils/base64.js'

function onInvite() {
  uni.showToast({ title: '微信邀请待接入', icon: 'none' })
}

function onConfirm() {
  uni.navigateTo({ url: '/subpackages/report/full' })
}

// 还原 prototype-v2 partner 顶部图标：双头像圆 + 两人形轮廓
const partnerGraphicSrc = 'data:image/svg+xml;base64,' + toBase64(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="112" height="112">' +
    '<circle cx="20" cy="22" r="8" fill="#FF8A7A" opacity="0.6"/>' +
    '<circle cx="36" cy="22" r="8" fill="#B8A4E8" opacity="0.6"/>' +
    '<path d="M12 44c0-6 4-10 8-10s8 4 8 10" stroke="#999" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M28 44c0-6 4-10 8-10s8 4 8 10" stroke="#999" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '</svg>'
)
</script>

<template>
  <view class="screen">
    <NavBar title="邀请伴侣" />

    <view class="screen-body screen-body-center">
      <image class="partner-graphic" :src="partnerGraphicSrc" mode="widthFix" />

      <text class="screen-title">邀请 TA 一起看</text>
      <text class="hint-text hint-text-center">共享规划书和预算看板（只读）</text>
      <text class="hint-text hint-text-center">一起确认小家的预算</text>

      <button class="grad-btn" @tap="onInvite">发送微信邀请</button>

      <view class="glass-card kv-list">
        <view class="kv-row">
          <text>晓雯（我）</text>
          <text class="kv-val">管理员</text>
        </view>
        <view class="kv-row">
          <text>阿哲（伴侣）</text>
          <text class="text-muted">待加入</text>
        </view>
      </view>

      <button class="grad-btn grad-btn-outline" @tap="onConfirm">共同确认预算</button>
    </view>
  </view>
</template>

<style>
.partner-graphic {
  display: block;
  width: 112rpx;
  height: 112rpx;
  margin: 0 auto 40rpx;
}
</style>

