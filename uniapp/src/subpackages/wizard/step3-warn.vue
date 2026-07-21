<script setup>
import { computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const ratioPercent = computed(() => Math.round(wizard.fixedRatio * 100))
const total = computed(() => wizard.fixedTotal)

function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function onBack() {
  uni.navigateBack({ delta: 1 })
}
function onContinue() {
  uni.redirectTo({ url: '/subpackages/wizard/step4' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" rightText="3/5" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body screen-body-scroll">
      <view class="warn-card">
        <text class="warn-icon">⚠️</text>
        <text class="warn-title">固定支出占比较高</text>
        <text class="warn-desc">固定支出 ¥{{ format(total) }} 占收入 {{ ratioPercent }}%，可压缩空间较小。建议回头调整至少一项后再继续。</text>
      </view>

      <view class="ratio-bar warn">
        <text class="ratio-text">固定支出占比 {{ ratioPercent }}%</text>
        <text class="ratio-tip">占比较高（≥50%），但未达失衡线（90%）</text>
      </view>

      <view class="btn-row">
        <button class="text-link" @tap="onBack">返回修改</button>
        <button class="grad-btn" @tap="onContinue">仍要继续</button>
      </view>
    </view>
  </view>
</template>

<style>
.warn-card {
  background: rgba(255, 200, 100, 0.2);
  border-radius: 16rpx;
  padding: 32rpx 24rpx;
  margin-top: 24rpx;
  text-align: center;
}
.warn-icon { display: block; font-size: 64rpx; margin-bottom: 16rpx; }
.warn-title { display: block; font-size: 36rpx; font-weight: 700; color: var(--color-text); margin-bottom: 12rpx; }
.warn-desc { display: block; font-size: 26rpx; color: var(--color-text-2); line-height: 1.5; }
.ratio-bar { margin-top: 24rpx; padding: 16rpx 24rpx; border-radius: 12rpx; background: rgba(255, 180, 0, 0.18); }
.ratio-text { display: block; font-size: 28rpx; font-weight: 600; }
.ratio-tip { display: block; font-size: 24rpx; color: var(--color-text-2); margin-top: 4rpx; }
.btn-row { margin-top: 40rpx; display: flex; gap: 16rpx; align-items: center; }
.btn-row .grad-btn { flex: 1; }
</style>