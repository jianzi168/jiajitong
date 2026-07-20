<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'

function getQuery(name) {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const raw = (current && current.options && current.options[name]) || ''
  try { return decodeURIComponent(raw) } catch (e) { return raw }
}

const city = getQuery('city') || '上海'
const income = Number(getQuery('income')) || 32000
const housing = ref(11000)

function onHousingInput(e) {
  const v = String(e.detail.value).replace(/[^\d]/g, '')
  housing.value = Number(v) || 0
}

function onSliderChange(e) {
  housing.value = Number(e.detail.value)
}

function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}

// 实时显示固定占比预警
const fixedRatio = computed(() => {
  return income > 0 ? Math.round((housing.value / income) * 100) : 0
})
const fixedRatioWarning = computed(() => fixedRatio.value >= 50 && fixedRatio.value < 90)
const fixedRatioDanger = computed(() => fixedRatio.value >= 90)

function onSeeResult() {
  if (fixedRatioDanger.value) {
    uni.navigateTo({ url: '/pages/error/imbalance' })
    return
  }
  uni.navigateTo({
    url: `/pages/quick/result?city=${encodeURIComponent(city)}&income=${income}&housing=${housing.value}`,
  })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <view class="screen-body">
      <view class="step-pips step-pips-top">
        <view class="pip on"></view>
        <view class="pip on"></view>
        <view class="pip on"></view>
      </view>

      <text class="field-heading">房贷或房租（每月）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input
          class="field-input"
          type="number"
          :value="format(housing)"
          @input="onHousingInput"
        />
      </view>

      <view class="ratio-bar" :class="{ warn: fixedRatioWarning, danger: fixedRatioDanger }">
        <text class="ratio-text">固定支出占比 {{ fixedRatio }}%</text>
        <text v-if="fixedRatioDanger" class="ratio-tip">收支失衡（≥90%），建议先梳理必选项</text>
        <text v-else-if="fixedRatioWarning" class="ratio-tip">占比较高（≥50%），可压缩空间小</text>
        <text v-else class="ratio-tip">合理区间</text>
      </view>

      <slider
        class="slider-field"
        :value="housing"
        min="0"
        :max="Math.max(income * 0.9, 20000)"
        :step="500"
        activeColor="#FF6B8A"
        backgroundColor="rgba(28, 25, 23, 0.1)"
        block-color="#FF6B8A"
        block-size="20"
        @change="onSliderChange"
      />

      <button class="grad-btn" @tap="onSeeResult">看看测算结果</button>
    </view>
  </view>
</template>

<style>
.ratio-bar {
  margin-top: 24rpx;
  padding: 16rpx 24rpx;
  background: rgba(120, 200, 120, 0.15);
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.ratio-bar.warn { background: rgba(255, 180, 0, 0.18); }
.ratio-bar.danger { background: rgba(220, 50, 50, 0.18); }
.ratio-text { font-size: 28rpx; font-weight: 600; color: var(--color-text); }
.ratio-tip { font-size: 24rpx; color: var(--color-text-2); }
</style>