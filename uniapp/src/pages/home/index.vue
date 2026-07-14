<script setup>
import FloatNav from '@/components/FloatNav.vue'

const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20

function onRecalc() {
  uni.reLaunch({ url: '/subpackages/wizard/step1' })
}

function onGoReport() {
  uni.navigateTo({ url: '/subpackages/report/preview' })
}

function onGoActions() {
  uni.navigateTo({ url: '/pages/actions/index' })
}
</script>

<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <text class="page-title">晓雯的家庭</text>
      <text class="text-link" @tap="onRecalc">重新测算</text>
    </view>

    <view class="screen-body screen-body-scroll screen-body-tab">
      <view class="bento-grid">
        <view class="bento-cell bento-cell-wide glass-card" @tap="onGoReport">
          <view class="score-inline">
            <text class="score-big">82</text>
            <text>分</text>
            <text class="status-pill status-pill-ok">稳健</text>
          </view>
          <text class="cell-link">查看完整规划书 ›</text>
        </view>

        <view class="bento-cell glass-card">
          <text class="glass-label">本月储蓄</text>
          <text class="glass-value-sm">¥4,800 / ¥6,400</text>
          <view class="track-bar">
            <view class="track-fill track-fill-warn" style="width:75%"></view>
          </view>
          <text class="cell-meta">75%</text>
        </view>

        <view class="bento-cell glass-card">
          <text class="glass-label">备育储备</text>
          <text class="glass-value-sm">¥32,000 / ¥80,000</text>
          <view class="track-bar">
            <view class="track-fill" style="width:40%"></view>
          </view>
          <text class="cell-meta">40% · 18 个月</text>
        </view>
      </view>

      <text class="section-heading">待处理建议 (2)</text>

      <view class="glass-card glass-card-tip glass-card-accent-border" @tap="onGoActions">
        <text class="tip-strong">备育储备有点紧</text>
        <text class="tip-p">建议每月额外储备 ¥4,000…</text>
      </view>

      <view class="glass-card glass-card-tip" @tap="onGoActions">
        <text class="tip-strong">餐饮可以优化</text>
        <text class="tip-p">外卖频率偏高，减一减…</text>
      </view>
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
.tip-p {
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.5;
}
</style>