<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { getMonthlyReview, getMonthlyTrend } from '@/services/api'
import { trackPage } from '@/utils/analytics'

const loading = ref(true)
const review = ref(null) // { has_data, month_label, metrics, overspend_top, surplus_top, suggestion }

// 月份导航：后端 reviews.getMonthly 本就支持任意年月（含跨月按天分摊），
// 此前前端从不传参，导致用户只能看本月、无法回看历史。
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

const isCurrentMonth = computed(
  () => year.value === now.getFullYear() && month.value === now.getMonth() + 1
)

async function load() {
  loading.value = true
  try {
    const res = await getMonthlyReview({ year: year.value, month: month.value })
    review.value = res
  } catch (e) {
    review.value = null
  } finally {
    loading.value = false
  }
}

onShow(async () => {
  trackPage('review')
  // 每次进入都回到本月（避免停留在旧月份看到过期数据）
  year.value = now.getFullYear()
  month.value = now.getMonth() + 1
  await load()
})

function onPrevMonth() {
  const d = new Date(year.value, month.value - 2, 1)
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
  load()
}

function onNextMonth() {
  if (isCurrentMonth.value) return
  const d = new Date(year.value, month.value, 1)
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
  load()
}

/**
 * 多月趋势。
 *
 * 只统计由填报行为产生的指标（支出 / 储蓄率 / 餐饮占比 / 执行率），
 * 不含健康分 —— 健康分是方案属性而非当月行为，未重新测算时画出来
 * 是一条毫无意义的直线。
 */
const trend = ref(null)

onMounted(async () => {
  try {
    const r = await getMonthlyTrend({ limit: 6 })
    trend.value = (r && r.months && r.months.length) ? r : null
  } catch (e) {
    trend.value = null // 趋势是增强项，失败不影响复盘主流程
  }
})

// 柱状图：以区间内最大支出为满高，避免单月数值大时其他柱看不见
const maxSpend = computed(() => {
  const list = (trend.value && trend.value.months) || []
  return list.reduce((m, x) => Math.max(m, x.spend || 0), 0)
})
const trendBars = computed(() => {
  const list = (trend.value && trend.value.months) || []
  const max = maxSpend.value
  return list.map((m) => ({
    ...m,
    // 至少留 6% 高度，支出为 0 的月份也看得见柱子
    heightPct: max > 0 ? Math.max(6, Math.round((m.spend / max) * 100)) : 6,
  }))
})
// 最近一个月的同比变化，用于「比上月」摘要
const latestTrend = computed(() => {
  const list = (trend.value && trend.value.months) || []
  return list.length ? list[list.length - 1] : null
})

const hasData = computed(() => review.value && review.value.has_data)
const metrics = computed(() => (review.value && review.value.metrics) || null)

// 执行率 / 健康分（带上月对比 "78→82"）
const metricItems = computed(() => {
  if (!metrics.value) return []
  const items = [{ val: `${metrics.value.execution_rate}%`, key: '执行率' }]
  const hs = metrics.value.health_score
  const prev = metrics.value.prev_health_score
  items.push({ val: prev !== null && prev !== undefined ? `${prev}→${hs}` : `${hs}`, key: '健康分' })
  return items
})

// 空态文案随所选月份变化（历史月说"该月"，本月说"本月"）
const emptyMonthLabel = computed(() => (isCurrentMonth.value ? '本月' : `${month.value}月`))

/**
 * 变化量文案。higherIsBetter 用于判断好坏色：
 * 储蓄率越高越好，支出/餐饮占比则相反。
 */
function deltaText(d) {
  if (d === null || d === undefined) return ''
  if (d === 0) return '持平'
  const sign = d > 0 ? '↑' : '↓'
  return `${sign}${Math.abs(d)}`
}
function deltaClass(d, higherIsBetter) {
  if (d === null || d === undefined || d === 0) return 'flat'
  const good = higherIsBetter ? d > 0 : d < 0
  return good ? 'good' : 'bad'
}

function onWeekly() {
  uni.navigateTo({ url: '/pages/weekly/index' })
}

function onFullReport() {
  uni.navigateTo({ url: '/subpackages/report/full' })
}
</script>

<template>
  <view class="screen">
    <NavBar :title="(review && review.month_label || '本月') + '复盘'" />

    <ScreenBody class="screen-body-scroll">
      <!-- 月份切换 -->
      <view class="month-switch">
        <text class="month-arrow" @tap="onPrevMonth">‹</text>
        <text class="month-label">{{ year }} 年 {{ month }} 月{{ isCurrentMonth ? '（本月）' : '' }}</text>
        <text
          class="month-arrow"
          :class="{ disabled: isCurrentMonth }"
          @tap="onNextMonth"
        >›</text>
      </view>

      <!-- 多月趋势：先看到走势，再往下看单月明细 -->
      <view v-if="trend" class="glass-card trend-card">
        <text class="trend-title">近 {{ trendBars.length }} 个月支出趋势</text>

        <view class="trend-chart">
          <view v-for="b in trendBars" :key="b.month" class="trend-col">
            <text class="trend-val">¥{{ b.spend }}</text>
            <view class="trend-bar-wrap">
              <view class="trend-bar" :style="{ height: b.heightPct + '%' }"></view>
            </view>
            <text class="trend-label">{{ b.label }}</text>
          </view>
        </view>

        <view v-if="latestTrend" class="trend-summary">
          <view class="trend-metric">
            <text class="trend-metric-key">储蓄率</text>
            <text class="trend-metric-val">
              {{ latestTrend.savings_rate }}%
              <text v-if="latestTrend.deltas.savings_rate !== null" class="trend-delta" :class="deltaClass(latestTrend.deltas.savings_rate, true)">
                {{ deltaText(latestTrend.deltas.savings_rate) }}
              </text>
            </text>
          </view>
          <view class="trend-metric">
            <text class="trend-metric-key">餐饮占比</text>
            <text class="trend-metric-val">
              {{ latestTrend.food_ratio }}%
              <text v-if="latestTrend.deltas.food_ratio !== null" class="trend-delta" :class="deltaClass(latestTrend.deltas.food_ratio, false)">
                {{ deltaText(latestTrend.deltas.food_ratio) }}
              </text>
            </text>
          </view>
          <view class="trend-metric">
            <text class="trend-metric-key">预算执行</text>
            <text class="trend-metric-val">
              {{ latestTrend.execution_rate }}%
              <text v-if="latestTrend.deltas.spend !== null" class="trend-delta" :class="deltaClass(latestTrend.deltas.spend, false)">
                {{ deltaText(latestTrend.deltas.spend) }}
              </text>
            </text>
          </view>
        </view>
      </view>

      <!-- 加载中 -->
      <view v-if="loading" class="review-empty">
        <text class="empty-sub">加载中…</text>
      </view>

      <!-- 无数据 -->
      <view v-else-if="!hasData" class="review-empty">
        <text class="empty-title">{{ emptyMonthLabel }}暂无记账数据</text>
        <text class="empty-sub">先去填写本周支出，月末自动生成复盘</text>
        <button class="grad-btn" style="margin-top: 16rpx;" @tap="onWeekly">填写本周支出</button>
      </view>

      <!-- 复盘数据 -->
      <template v-else>
        <view class="glass-card">
          <view class="metric-row metric-row-flat">
            <view
              v-for="m in metricItems"
              :key="m.key"
              class="metric-cell"
            >
              <text class="metric-val">{{ m.val }}</text>
              <text class="metric-key">{{ m.key }}</text>
            </view>
          </view>
        </view>

        <text class="section-heading">超支 Top</text>
        <view v-if="review.overspend_top.length" class="glass-card" style="padding: 0 32rpx;">
          <view
            v-for="b in review.overspend_top"
            :key="b.id"
            class="budget-line"
          >
            <text>{{ b.name }}</text>
            <text class="budget-amt">+¥{{ b.over }}</text>
            <text class="budget-pct budget-pct-danger">超支 {{ b.pct }}%</text>
          </view>
        </view>
        <view v-else class="review-none glass-card">
          <text>{{ emptyMonthLabel }}无超支分类 🎉</text>
        </view>

        <text class="section-heading">结余 Top</text>
        <view v-if="review.surplus_top.length" class="glass-card" style="padding: 0 32rpx;">
          <view
            v-for="b in review.surplus_top"
            :key="b.id"
            class="budget-line"
          >
            <text>{{ b.name }}</text>
            <text class="budget-amt">-¥{{ b.save }}</text>
            <text class="budget-pct">结余</text>
          </view>
        </view>
        <view v-else class="review-none glass-card">
          <text>{{ emptyMonthLabel }}无结余分类</text>
        </view>

        <view class="glass-card glass-card-tip" style="margin-top: 24rpx;">
          <text class="tip-strong">本月建议</text>
          <text class="tip-p">{{ review.suggestion }}</text>
        </view>

        <button class="grad-btn grad-btn-outline" style="margin-top: 32rpx;" @tap="onFullReport">查看完整报告</button>
      </template>
    </ScreenBody>
  </view>
</template>

<style>
.tip-p {
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.5;
}
.review-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 120rpx 32rpx;
}
.review-empty .empty-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--color-text);
}
.review-empty .empty-sub {
  font-size: 26rpx;
  color: var(--color-text-2);
  text-align: center;
}
.review-none {
  padding: 28rpx 32rpx;
  font-size: 28rpx;
  color: var(--color-text-3);
}
.month-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40rpx;
  padding: 8rpx 0 24rpx;
}

/* 多月趋势 */
.trend-card {
  padding: 28rpx 24rpx 24rpx;
  margin-bottom: 32rpx;
}
.trend-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 24rpx;
}
.trend-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12rpx;
  height: 220rpx;
}
.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.trend-val {
  font-size: 20rpx;
  color: var(--color-text-3);
  margin-bottom: 8rpx;
}
/* 柱体外框占满剩余高度，柱体自身按百分比从底部生长 */
.trend-bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.trend-bar {
  width: 70%;
  border-radius: 8rpx 8rpx 0 0;
  background: linear-gradient(180deg, #FF8A5C, #FF6B8A);
}
.trend-label {
  font-size: 22rpx;
  color: var(--color-text-3);
  margin-top: 10rpx;
}
.trend-summary {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--color-border);
}
.trend-metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.trend-metric-key {
  font-size: 22rpx;
  color: var(--color-text-3);
}
.trend-metric-val {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.trend-delta { font-size: 20rpx; margin-left: 4rpx; }
.trend-delta.good { color: #22C55E; }
.trend-delta.bad { color: var(--color-coral); }
.trend-delta.flat { color: var(--color-text-3); }
.month-arrow {
  font-size: 44rpx;
  line-height: 1;
  color: var(--color-text);
  padding: 8rpx 24rpx;
}
.month-arrow.disabled {
  color: var(--color-text-3);
  opacity: 0.4;
}
.month-label {
  font-size: 28rpx;
  color: var(--color-text-2);
  min-width: 260rpx;
  text-align: center;
}
</style>
