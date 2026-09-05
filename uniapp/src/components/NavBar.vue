<script setup>
import { getCapsuleSafeArea } from '@/utils/capsule'

defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: true },
  rightText: { type: String, default: '' },
})
defineEmits(['back'])
defineExpose({})

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
const placeholderHeight = statusBarHeight + navBarHeight

function onBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/home/index' }) })
}
</script>

<template>
  <view class="navbar-root">
    <view class="navbar">
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
      <view
        class="navbar-inner"
        :style="{
          height: navBarHeight + 'px',
          paddingRight: capsuleReserveRight + 'px',
        }"
      >
        <button v-if="showBack" class="nav-back" @tap="onBack">
          <text class="back-arrow">‹</text>
        </button>
        <text class="navbar-title">{{ title }}</text>
        <view
          v-if="rightText"
          class="navbar-right"
          :style="{ right: capsuleReserveRight + 'px' }"
        >
          <text class="step-label">{{ rightText }}</text>
        </view>
      </view>
    </view>
    <!-- 占位：fixed 导航脱离文档流后，避免正文被挡住 -->
    <view class="navbar-placeholder" :style="{ height: placeholderHeight + 'px' }"></view>
  </view>
</template>

<style>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(16rpx);
  border-bottom: 1rpx solid var(--color-border);
}
.navbar-placeholder {
  width: 100%;
  flex-shrink: 0;
}
.navbar-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 32rpx;
  box-sizing: border-box;
}
.navbar-title {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 120rpx;
  box-sizing: border-box;
}
.nav-back {
  position: absolute;
  left: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 72rpx; height: 72rpx; border: none; border-radius: 50%; padding: 0;
  background: var(--color-surface); box-shadow: var(--shadow-soft);
  display: flex; align-items: center; justify-content: center;
  z-index: 1;
}
.nav-back::after { border: none; }
.back-arrow { font-size: 48rpx; line-height: 1; color: var(--color-text); margin-top: -6rpx; }
.navbar-right {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  z-index: 1;
  max-width: 28%;
}
.navbar-right .step-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
