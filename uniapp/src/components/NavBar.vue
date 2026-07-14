<script setup>
defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: true }
})
defineEmits(['back'])
defineExpose({})

// 状态栏高度（刘海/信号栏区域），custom 导航必须自行避让
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20

function onBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/home/index' }) })
}
</script>

<template>
  <view class="navbar">
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="navbar-inner">
      <button v-if="showBack" class="nav-back" @tap="onBack">
        <text class="back-arrow">‹</text>
      </button>
      <text class="navbar-title">{{ title }}</text>
      <view v-if="$slots.right" class="navbar-right">
        <slot name="right" />
      </view>
    </view>
  </view>
</template>

<style>
.navbar {
  background: var(--glass);
  backdrop-filter: blur(16rpx);
  border-bottom: 1rpx solid var(--color-border);
}
.navbar-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx 32rpx;
  min-height: 88rpx;
  box-sizing: border-box;
}
.navbar-title {
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  pointer-events: none;
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
.navbar-right { position: absolute; right: 32rpx; top: 50%; transform: translateY(-50%); display: flex; align-items: center; z-index: 1; }
</style>
