<script setup>
import NavBar from '@/components/NavBar.vue'

function onSubscribe() {
  uni.showToast({ title: '订阅消息申请中', icon: 'none' })
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