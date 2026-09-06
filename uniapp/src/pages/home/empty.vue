<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import FloatNav from '@/components/FloatNav.vue'
import { getCapsuleSafeArea } from '@/utils/capsule'

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
const headerPlaceholder = statusBarHeight + navBarHeight

function onStart() {
  uni.navigateTo({ url: '/pages/quick/step1' })
}
</script>

<template>
  <view class="screen">
    <view class="tab-header">
      <view :style="{ height: statusBarHeight + 'px' }"></view>
      <view
        class="tab-header-nav"
        :style="{
          height: navBarHeight + 'px',
          paddingRight: capsuleReserveRight + 'px',
        }"
      >
        <text class="page-title">家计通</text>
      </view>
    </view>
    <view class="simple-header-placeholder" :style="{ height: headerPlaceholder + 'px' }"></view>

    <ScreenBody tab class="screen-body-center empty-state">
      <view class="empty-graphic">
        <view class="empty-graphic-placeholder">📋</view>
      </view>
      <text class="screen-title">还没有家庭规划书</text>
      <text class="hint-text">3 分钟测一测，看看合理预算大概多少</text>
      <button class="grad-btn" @tap="onStart">开始测算</button>
    </ScreenBody>

    <FloatNav active="home" />
  </view>
</template>

<style>
.tab-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(16rpx);
}
.tab-header-nav {
  display: flex;
  align-items: center;
  padding-left: 40rpx;
  box-sizing: border-box;
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
