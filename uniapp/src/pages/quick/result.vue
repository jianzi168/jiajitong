<script setup>
import { ref, onMounted } from 'vue'
import ScoreRing from '@/components/ScoreRing.vue'
import NavBar from '@/components/NavBar.vue'
import engineClient from '@/utils/engineClient.js'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const city = ref('')
const income = ref(0)
const housing = ref(0)
const score = ref(0)
const riskLevel = ref('green')
const rangeMin = ref(0)
const rangeMax = ref(0)
const tip = ref('')
const cityEstimated = ref(false)
const loading = ref(true)
const errorMsg = ref('')

function getQuery(name) {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  return (current && current.options && current.options[name]) || ''
}

onMounted(async () => {
  city.value = getQuery('city') || '上海'
  income.value = Number(getQuery('income')) || 32000
  housing.value = Number(getQuery('housing')) || 11000

  try {
    const r = await engineClient.callCalcQuick({
      city: city.value,
      income: income.value,
      housing: housing.value,
    })
    score.value = r.health_score
    riskLevel.value = r.risk_level
    rangeMin.value = r.disposable_range[0]
    rangeMax.value = r.disposable_range[1]
    tip.value = r.top_recommendation
    cityEstimated.value = r.city_estimated
  } catch (e) {
    if (e.code === 40001) {
      // IMBALANCE
      uni.redirectTo({ url: '/pages/error/imbalance' })
      return
    }
    errorMsg.value = e.userHint || e.message || '测算失败，请稍后再试'
  } finally {
    loading.value = false
  }
})

function fmtMoney(n) {
  return '¥' + Number(n).toLocaleString('en-US')
}

function statusLabel(level) {
  return { green: '稳健区间', yellow: '关注区间', red: '需调整' }[level] || '稳健区间'
}

function onLogin() {
  // 预填 wizardStore（quick 结果带入完整向导）
  wizard.loadFromQuick({
    city: city.value,
    income: income.value,
    housing: housing.value,
  })
  uni.navigateTo({ url: '/subpackages/wizard/step1' })
}

function onRetry() {
  loading.value = true
  errorMsg.value = ''
  onMounted()
}
</script>

<template>
  <view class="screen">
    <NavBar title="测算结果" />

    <view class="screen-body screen-body-center result-body">
      <template v-if="loading">
        <text class="loading-text">测算中…</text>
      </template>

      <template v-else-if="errorMsg">
        <text class="error-text">{{ errorMsg }}</text>
        <button class="grad-btn" @tap="onRetry">重试</button>
      </template>

      <template v-else>
        <ScoreRing :score="score" size="lg" />
        <text class="score-caption">家庭财务健康分</text>
        <text class="status-pill" :class="'status-pill-' + riskLevel">
          {{ statusLabel(riskLevel) }}
        </text>

        <view v-if="cityEstimated" class="city-estimated-tag">
          您的城市暂按新一线标准估算
        </view>

        <view class="glass-card glass-card-accent result-card">
          <text class="glass-label">合理生活预算区间</text>
          <text class="glass-value">{{ fmtMoney(rangeMin) }} — {{ fmtMoney(rangeMax) }} / 月</text>
        </view>

        <view class="glass-card glass-card-tip result-card">
          <text class="tip-strong">小建议</text>
          <text class="tip-p">{{ tip }}</text>
        </view>

        <button class="grad-btn" @tap="onLogin">
          看完整规划书
        </button>
      </template>
    </view>
  </view>
</template>

<style>
.result-body { padding-top: 48rpx; }
.result-card { width: 100%; box-sizing: border-box; margin-top: 24rpx; }
.tip-strong { font-weight: 700; color: var(--color-text); display: block; margin-bottom: 8rpx; }
.tip-p { font-size: 28rpx; color: var(--color-text-2); line-height: 1.5; }
.loading-text, .error-text { color: var(--color-text-2); font-size: 28rpx; }
.city-estimated-tag {
  display: inline-block;
  padding: 8rpx 16rpx;
  margin-top: 16rpx;
  background: rgba(255, 200, 100, 0.2);
  border-radius: 8rpx;
  font-size: 24rpx;
  color: var(--color-text-2);
}
</style>