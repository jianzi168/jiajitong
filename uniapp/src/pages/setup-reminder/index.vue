<script setup>
import NavBar from '@/components/NavBar.vue'

// Phase 7: 接真实订阅授权引导
// 真实模板 ID 需在小程序后台申请后填入 (留 P1 推服务端)
// 留空数组时 uni.requestSubscribeMessage 会回调但不会真订阅, 用于演示授权 UI。
const tmplIds = []

function onSubscribe() {
  // #ifdef MP-WEIXIN
  if (typeof uni === 'undefined' || !uni.requestSubscribeMessage) {
    uni.showToast({ title: '当前环境不支持订阅消息', icon: 'none' })
    return
  }
  uni.requestSubscribeMessage({
    tmplIds,
    success: (res) => {
      const accepted = Object.values(res || {}).filter((v) => v === 'accept').length
      uni.setStorageSync('subscribe_status', { accepted, at: Date.now() })
      uni.showToast({ title: '已开启提醒', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 600)
    },
    fail: (e) => {
      uni.showToast({ title: (e && e.errMsg) || '订阅失败', icon: 'none' })
    },
  })
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '仅微信小程序支持订阅', icon: 'none' })
  // #endif
}

function onLater() {
  uni.reLaunch({ url: '/pages/dashboard/index' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="周度提醒" />

    <view class="screen-body screen-body-center">
      <view class="empty-graphic">
        <text style="font-size:56rpx;">⏰</text>
      </view>
      <text class="screen-title">每周日提醒你填一下</text>
      <text class="hint-text hint-text-center">30 秒更新 7 大类支出</text>
      <text class="hint-text hint-text-center">不打扰、不推销</text>

      <button class="grad-btn" @tap="onSubscribe">开启订阅消息</button>
      <button class="grad-btn grad-btn-ghost" @tap="onLater">稍后再说</button>
    </view>
  </view>
</template>