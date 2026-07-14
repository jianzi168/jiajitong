<script setup>
import ScoreRing from '@/components/ScoreRing.vue'
import NavBar from '@/components/NavBar.vue'

function onLogin() {
  uni.showToast({ title: '待接入登录', icon: 'none' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="测算结果" />

    <view class="screen-body screen-body-center result-body">
      <ScoreRing :score="78" size="lg" />
      <text class="score-caption">家庭财务健康分</text>
      <text class="status-pill status-pill-ok">稳健区间</text>

      <view class="glass-card glass-card-accent result-card">
        <text class="glass-label">合理生活预算区间</text>
        <text class="glass-value">¥8,200 — ¥10,800 / 月</text>
      </view>

      <view class="glass-card glass-card-tip result-card">
        <text class="tip-strong">小建议</text>
        <text class="tip-p">餐饮可能花得有点多，少点几次外卖，每月大概能省 ¥400–600。</text>
      </view>

      <button class="grad-btn" @tap="onLogin">
        登录看完整规划书
      </button>
    </view>
  </view>
</template>

<style>
.result-body { padding-top: 48rpx; }
.result-card { width: 100%; box-sizing: border-box; margin-top: 24rpx; }
.tip-strong { font-weight: 700; color: var(--color-text); display: block; margin-bottom: 8rpx; }
.tip-p { font-size: 28rpx; color: var(--color-text-2); line-height: 1.5; }
</style>
