<script setup>
import FloatNav from '@/components/FloatNav.vue'

const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20

function onGoQuick() {
  uni.navigateTo({ url: '/pages/quick/step1' })
}
</script>

<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <text class="page-title">预算看板</text>
      <text></text>
    </view>

    <view class="screen-body screen-body-center screen-body-tab empty-state">
      <view class="empty-graphic">
        <text class="empty-emoji">📊</text>
      </view>
      <text class="screen-title">启用预算追踪后就能看</text>
      <text class="hint-text hint-text-center">先完成家庭财务规划测算</text>
      <button class="grad-btn" @tap="onGoQuick">去测算</button>
    </view>

    <FloatNav active="dashboard" />
  </view>
</template>

<style>
.simple-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 40rpx;
}
.empty-emoji { font-size: 112rpx; }
</style>
