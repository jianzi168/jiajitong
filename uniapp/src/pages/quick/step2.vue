<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'

function getQuery(name) {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const raw = (current && current.options && current.options[name]) || ''
  try { return decodeURIComponent(raw) } catch (e) { return raw }
}

const city = getQuery('city') || '上海'
const income = ref(32000)

function onIncomeInput(e) {
  const v = String(e.detail.value).replace(/[^\d]/g, '')
  income.value = Number(v) || 0
}

function onSliderChange(e) {
  income.value = Number(e.detail.value)
}

function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function onNext() {
  if (income.value < 1000) {
    uni.showToast({ title: '收入至少 ¥1,000', icon: 'none' })
    return
  }
  uni.redirectTo({
    url: `/pages/quick/step3?city=${encodeURIComponent(city)}&income=${income.value}`,
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
        <view class="pip"></view>
      </view>

      <text class="field-heading">家庭月收入（税后）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input
          class="field-input"
          type="number"
          :value="format(income)"
          @input="onIncomeInput"
        />
      </view>

      <text class="hint-text">拖一拖滑块也能快速改</text>
      <slider
        class="slider-field"
        :value="income"
        min="5000"
        max="100000"
        :step="1000"
        activeColor="#FF6B8A"
        backgroundColor="rgba(28, 25, 23, 0.1)"
        block-color="#FF6B8A"
        block-size="20"
        @change="onSliderChange"
      />

      <button class="grad-btn" @tap="onNext">下一步</button>
    </view>
  </view>
</template>