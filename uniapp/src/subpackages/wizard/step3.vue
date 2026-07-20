<script setup>
import { computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const items = [
  { key: 'housing',   label: '房贷或房租', required: true },
  { key: 'loan',      label: '车贷 / 停车', required: false },
  { key: 'insurance', label: '保险（含补充）', required: false },
  { key: 'support',   label: '赡养父母',   required: false },
  { key: 'other',     label: '其他固定',   required: false },
]

const fixedRatio = computed(() => wizard.fixedRatio)
const ratioPercent = computed(() => Math.round(fixedRatio.value * 100))
const ratioClass = computed(() => {
  if (wizard.isImbalance) return 'danger'
  if (fixedRatio.value >= 0.5) return 'warn'
  return 'ok'
})

function onInput(key, e) {
  const v = String(e.detail.value).replace(/[^\d]/g, '')
  wizard.setFixed(key, v)
}

function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function onNext() {
  if (wizard.fixedExpenses.housing <= 0) {
    uni.showToast({ title: '请填写房贷/房租', icon: 'none' })
    return
  }
  if (wizard.isImbalance) {
    uni.navigateTo({ url: '/pages/error/imbalance' })
    return
  }
  if (fixedRatio.value >= 0.5) {
    uni.navigateTo({ url: '/subpackages/wizard/step3-warn' })
    return
  }
  uni.navigateTo({ url: '/subpackages/wizard/step4' })
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

    <view class="screen-body">
      <text class="screen-title">固定开销（每月）</text>
      <text class="hint-text">房贷/房租必填，其他可填 0</text>

      <view v-for="it in items" :key="it.key" class="expense-row">
        <text class="expense-label">
          {{ it.label }}
          <text v-if="it.required" class="expense-required">*</text>
        </text>
        <view class="expense-input">
          <text class="expense-yen">¥</text>
          <input
            type="number"
            :value="format(wizard.fixedExpenses[it.key])"
            @input="onInput(it.key, $event)"
          />
        </view>
      </view>

      <view class="ratio-bar" :class="ratioClass">
        <text class="ratio-text">固定支出占比 {{ ratioPercent }}%</text>
        <text class="ratio-tip" v-if="ratioClass === 'danger'">收支失衡（≥90%），建议先梳理必选项</text>
        <text class="ratio-tip" v-else-if="ratioClass === 'warn'">占比较高（≥50%），将显示压缩建议</text>
        <text class="ratio-tip" v-else>合理区间</text>
      </view>

      <button class="grad-btn" @tap="onNext">下一步</button>
    </view>
  </view>
</template>

<style>
.expense-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid rgba(0,0,0,0.05);
}
.expense-label { font-size: 30rpx; flex: 1; }
.expense-required { color: #FF6B8A; }
.expense-input {
  display: flex;
  align-items: center;
  background: rgba(0,0,0,0.04);
  border-radius: 8rpx;
  padding: 8rpx 16rpx;
  min-width: 200rpx;
}
.expense-yen { color: var(--color-text-2); margin-right: 8rpx; }
.expense-input input { text-align: right; }
.ratio-bar {
  margin-top: 32rpx;
  padding: 16rpx 24rpx;
  background: rgba(120, 200, 120, 0.15);
  border-radius: 12rpx;
}
.ratio-bar.warn { background: rgba(255, 180, 0, 0.18); }
.ratio-bar.danger { background: rgba(220, 50, 50, 0.18); }
.ratio-text { display: block; font-size: 28rpx; font-weight: 600; }
.ratio-tip { display: block; font-size: 24rpx; color: var(--color-text-2); margin-top: 4rpx; }
</style>