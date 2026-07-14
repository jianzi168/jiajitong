<script setup>
import FloatNav from '@/components/FloatNav.vue'

const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20

function onStart() {
  uni.navigateTo({ url: '/pages/quick/step1' })
}
</script>

<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <text class="page-title">家计通</text>
    </view>

    <view class="screen-body screen-body-center screen-body-tab empty-state">
      <view class="empty-graphic">
        <view class="empty-graphic-placeholder">📋</view>
      </view>
      <text class="screen-title">还没有家庭规划书</text>
      <text class="hint-text">3 分钟测一测，看看合理预算大概多少</text>
      <button class="grad-btn" @tap="onStart">开始测算</button>
    </view>

    <FloatNav active="home" />
  </view>
</template>

<style>
.simple-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 40rpx;
}
.empty-graphic-placeholder {
  width: 112rpx;
  height: 112rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #FFF5F2, #FDF4FF);
  border: 4rpx solid #E8A0BF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56rpx;
}
</style>