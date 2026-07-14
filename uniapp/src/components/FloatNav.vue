<script setup>
defineProps({
  active: { type: String, default: 'home' } // home | dashboard | profile
})

const tabs = [
  { key: 'home', label: '首页', url: '/pages/home/index' },
  { key: 'dashboard', label: '看板', url: '/pages/dashboard/index' },
  { key: 'profile', label: '我的', url: '/pages/profile/index' }
]

function go(tab) {
  uni.reLaunch({ url: tab.url })
}
</script>

<template>
  <view class="float-nav">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="float-nav-item"
      :class="{ active: active === tab.key }"
      @tap="go(tab)"
    >
      <text class="float-nav-icon" :class="'icon-' + tab.key"></text>
      <text class="float-nav-label">{{ tab.label }}</text>
    </button>
  </view>
</template>

<style>
.float-nav {
  position: fixed;
  bottom: 32rpx; left: 32rpx; right: 32rpx;
  display: flex;
  background: var(--glass);
  backdrop-filter: blur(24rpx);
  border: 1rpx solid var(--glass-border);
  border-radius: 999rpx;
  padding: 12rpx;
  box-shadow: 0 16rpx 64rpx rgba(28, 25, 23, 0.12);
  z-index: 20;
}
.float-nav-item {
  flex: 1; border: none; background: none; padding: 16rpx 8rpx;
  font-size: 20rpx; font-weight: 500; color: var(--color-text-3);
  border-radius: 999rpx;
  display: flex; flex-direction: column; align-items: center; gap: 4rpx;
}
.float-nav-item::after { border: none; }
.float-nav-item.active {
  background: var(--color-surface); color: var(--color-coral);
  font-weight: 600; box-shadow: var(--shadow-soft);
}
.float-nav-icon { width: 44rpx; height: 44rpx; display: block; }
/* 简易几何图标（无外部资源） */
.icon-home { border: 3rpx solid currentColor; border-radius: 8rpx 8rpx 4rpx 4rpx; }
.icon-dashboard {
  border: 3rpx solid currentColor; border-radius: 6rpx;
  position: relative; box-sizing: border-box;
}
.icon-dashboard::after {
  content: ''; position: absolute; left: 50%; top: 0; bottom: 0;
  width: 3rpx; background: currentColor;
}
.icon-profile { border: 3rpx solid currentColor; border-radius: 50%; }
.float-nav-label { line-height: 1; }
</style>
