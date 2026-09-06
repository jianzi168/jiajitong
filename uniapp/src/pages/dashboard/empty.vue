<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import FloatNav from '@/components/FloatNav.vue'
import { getCapsuleSafeArea } from '@/utils/capsule'

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
const headerPlaceholder = statusBarHeight + navBarHeight

function onGoQuick() {
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
        <text class="page-title">预算看板</text>
      </view>
    </view>
    <view class="simple-header-placeholder" :style="{ height: headerPlaceholder + 'px' }"></view>

    <ScreenBody tab class="screen-body-center empty-state">
      <view class="empty-graphic">
        <text class="empty-emoji">📊</text>
      </view>
      <text class="screen-title">启用预算追踪后就能看</text>
      <text class="hint-text hint-text-center">先完成家庭财务规划测算</text>
      <button class="grad-btn" @tap="onGoQuick">去测算</button>
    </ScreenBody>

    <FloatNav active="dashboard" />
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
.empty-emoji { font-size: 112rpx; }
</style>
