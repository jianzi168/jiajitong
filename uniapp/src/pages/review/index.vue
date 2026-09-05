<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { getMonthlyReview } from '@/services/api'
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
          <text>本月无结余分类</text>
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
