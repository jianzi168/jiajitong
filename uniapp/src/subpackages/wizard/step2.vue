<script setup>
import { ref, onMounted, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import engineClient from '@/utils/engineClient.js'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const cities = ref([])
const loading = ref(true)
const showPicker = ref(false)
const stabilities = [
  { id: 'stable', label: '稳定' },
  { id: 'bonus', label: '含奖金' },
  { id: 'volatile', label: '一方波动' },
]

onMounted(async () => {
  try {
    const r = await engineClient.callCitiesList()
    cities.value = r.cities
    if (!wizard.city && r.cities[0]) wizard.setCity(r.cities[0].name)
  } finally {
    loading.value = false
  }
})

function pickCity(name) {
  wizard.setCity(name)
  showPicker.value = false
}

const income = computed({
  get: () => wizard.monthlyIncome,
  set: (v) => wizard.setIncome(v),
})

function onIncomeInput(e) {
  const v = String(e.detail.value).replace(/[^\d]/g, '')
  wizard.setIncome(v)
}
function onSliderChange(e) {
  wizard.setIncome(e.detail.value)
}
function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}
function onNext() {
  if (!wizard.city) {
    uni.showToast({ title: '请选择城市', icon: 'none' })
    return
  }
  if (wizard.monthlyIncome < 1000) {
    uni.showToast({ title: '收入至少 ¥1,000', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/subpackages/wizard/step3' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" rightText="2/5" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
      <view class="seg"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body">
      <text class="field-heading">所在城市</text>
      <view v-if="loading" class="field-block"><text>加载中…</text></view>
      <view v-else class="field-block select-field" @tap="showPicker = !showPicker">
        <text>{{ wizard.city || '请选择' }}</text>
        <text class="chev">{{ showPicker ? '▲' : '▼' }}</text>
      </view>

      <view v-if="showPicker" class="city-picker">
        <view
          v-for="c in cities"
          :key="c.name"
          class="city-item"
          :class="{ active: c.name === wizard.city }"
          @tap="pickCity(c.name)"
        >
          <text>{{ c.name }}</text>
          <text class="city-tier">{{ c.tier === 'tier1' ? '一线' : '新一线' }}</text>
        </view>
      </view>

      <text class="field-heading">家庭月收入（税后合计）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input
          class="field-input"
          type="number"
          :value="format(income)"
          @input="onIncomeInput"
        />
      </view>
      <slider
        class="slider-field"
        :value="income"
        min="5000"
        max="150000"
        :step="1000"
        activeColor="#FF6B8A"
        backgroundColor="rgba(28, 25, 23, 0.1)"
        block-color="#FF6B8A"
        block-size="20"
        @change="onSliderChange"
      />

      <text class="field-heading">收入稳不稳？</text>
      <view class="pill-group">
        <view
          v-for="s in stabilities"
          :key="s.id"
          class="pill-option"
          :class="{ selected: wizard.incomeStability === s.id }"
          @tap="wizard.setStability(s.id)"
        >
          <text>{{ s.label }}</text>
        </view>
      </view>

      <button class="grad-btn" @tap="onNext">下一步</button>
    </view>
  </view>
</template>

<style>
.city-picker {
  margin-top: 12rpx;
  background: rgba(255,255,255,0.6);
  border-radius: 12rpx;
  padding: 8rpx;
}
.city-item {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 20rpx;
  border-bottom: 1rpx solid rgba(0,0,0,0.05);
}
.city-item.active { background: rgba(255,107,138,0.08); }
.city-tier { font-size: 24rpx; color: var(--color-text-2); }
</style>