<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { getMonthlyReview } from '@/services/api'
import { trackPage } from '@/utils/analytics'

const loading = ref(true)
const review = ref(null) // { has_data, month_label, metrics, overspend_top, surplus_top, suggestion }

onShow(async () => {
  trackPage('review')
  loading.value = true
  try {
    const res = await getMonthlyReview({})
    review.value = res
  } catch (e) {
    review.value = null
  } finally {
    loading.value = false
  }
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
      <!-- 加载中 -->
      <view v-if="loading" class="review-empty">
        <text class="empty-sub">加载中…</text>
      </view>

      <!-- 无数据 -->
      <view v-else-if="!hasData" class="review-empty">
        <text class="empty-title">本月暂无记账数据</text>
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
          <text>本月无超支分类 🎉</text>
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
</style>
