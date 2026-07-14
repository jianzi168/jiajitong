<script setup>
import NavBar from '@/components/NavBar.vue'

const tips = [
  '看看有没有能合并或削减的固定项',
  '暂时降低储蓄目标，先保障基本生活',
  '联系 1v1 规划咨询（可选）'
]

function onBack() {
  uni.navigateTo({ url: '/subpackages/wizard/step3-warn' })
}

function onExit() {
  uni.reLaunch({ url: '/pages/landing/index' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="提示" />

    <view class="screen-body screen-body-center empty-state">
      <view class="empty-graphic empty-graphic-warn">
        <text style="font-size:56rpx;">⚠️</text>
      </view>
      <text class="screen-title">收支严重失衡</text>
      <text class="hint-text hint-text-center">固定支出占收入 92%，没法生成合理预算</text>
      <text class="hint-text hint-text-center">建议先优化固定开支或调整储蓄目标</text>

      <view class="glass-card glass-card-tip">
        <text class="tip-strong">可以试试</text>
        <view class="numbered-list">
          <text v-for="(tip, idx) in tips" :key="idx" class="li">{{ tip }}</text>
        </view>
      </view>

      <button class="grad-btn" @tap="onBack">返回修改</button>
      <button class="grad-btn grad-btn-ghost" @tap="onExit">退出</button>
    </view>
  </view>
</template>