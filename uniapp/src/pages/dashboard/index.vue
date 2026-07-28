<script setup>
import { ref, computed, onShow } from 'vue'
import FloatNav from '@/components/FloatNav.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { usePlanStore } from '@/stores/plan'

const store = usePlanStore()
const statusBarHeight = (uni.getSystemInfoSync().statusBarHeight || 20) * 2

// 当前月份显示文案（如 "7月预算"）
const monthLabel = computed(() => {
  const now = new Date()
  return `${now.getMonth() + 1}月预算`
})

const activated = computed(() => store.activated)
const loading = computed(() => store.loading)
const dashboard = computed(() => store.dashboard || {})
const categories = computed(() => dashboard.value.categories || [])
const totals = computed(() => dashboard.value.totals || null)
const babyReserve = computed(() => dashboard.value.baby_reserve || null)

onShow(async () => {
  try {
    await store.loadDashboard()
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
})

async function onActivate() {
  try {
    uni.showLoading({ title: '启用中...' })
    await store.activate()
    await store.loadDashboard()
    uni.hideLoading()
    uni.showToast({ title: '已启用追踪', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.message || '启用失败', icon: 'none' })
  }
}

function onWeekly() {
  uni.navigateTo({ url: '/pages/weekly/index' })
}
function onActions() {
  uni.navigateTo({ url: '/pages/actions/index' })
}
function onReview() {
  uni.navigateTo({ url: '/pages/review/index' })
}
</script>

<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'rpx' }">
      <text class="page-title">{{ monthLabel }}</text>
    </view>

    <view class="screen-body screen-body-scroll screen-body-tab">
      <!-- 未启用空态 -->
      <view v-if="!loading && !activated" class="empty-wrap">
        <text class="empty-title">还没有启用追踪</text>
        <text class="empty-sub">启用后这里会显示本月 7 类预算进度</text>
        <button class="grad-btn" @tap="onActivate">启用预算追踪</button>
      </view>

      <!-- 加载中 -->
      <view v-else-if="loading" class="loading-wrap">
        <text class="loading-text">加载中…</text>
      </view>

      <!-- 实态 -->
      <view v-else>
        <view class="bento-grid bento-grid-gap">
          <view class="bento-cell bento-cell-wide glass-card">
            <text class="glass-label">可支配预算</text>
            <text class="glass-value">¥{{ totals ? totals.suggested : 0 }}</text>
            <ProgressBar
              :pct="totals ? totals.pct : 0"
              :color="totals ? totals.color : 'green'"
            />
            <text class="cell-meta">
              已用 {{ totals ? totals.pct : 0 }}% · ¥{{ totals ? totals.used : 0 }}
            </text>
          </view>

          <view v-if="babyReserve" class="bento-cell glass-card">
            <text class="glass-label">备育储备</text>
            <text class="glass-value-sm">
              ¥{{ babyReserve.current || 0 }} / ¥{{ babyReserve.target || 0 }}
            </text>
            <ProgressBar
              :pct="babyReserve.pct || 0"
              :color="babyReserve.color || 'green'"
            />
            <text class="cell-meta">{{ babyReserve.pct || 0 }}%</text>
          </view>
        </view>

        <text class="section-heading">7 大类进度</text>
        <view class="category-list">
          <view class="category-cell" v-for="c in categories" :key="c.id" @tap="onWeekly">
            <view class="cell-header">
              <text>{{ c.name }}</text>
              <text>¥{{ c.used }} / ¥{{ c.suggested }}</text>
            </view>
            <ProgressBar :pct="c.pct" :color="c.color" size="sm" />
          </view>
        </view>

        <view class="action-row">
          <button class="grad-btn" @tap="onWeekly">填写本周支出</button>
          <button class="grad-btn grad-btn-outline" @tap="onActions">行动清单</button>
        </view>

        <view class="bottom-link" @tap="onReview">
          <text class="bottom-link-text">查看历史复盘</text>
          <text class="bottom-link-chev">›</text>
        </view>
      </view>
    </view>

    <FloatNav active="dashboard" />
  </view>
</template>

<style scoped>
.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 96rpx 32rpx;
}
.empty-title {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--color-text);
}
.empty-sub {
  font-size: 28rpx;
  color: var(--color-sub);
  margin-bottom: 16rpx;
}
.loading-wrap {
  display: flex;
  justify-content: center;
  padding: 96rpx 0;
}
.loading-text {
  font-size: 28rpx;
  color: var(--color-sub);
}
.simple-header {
  display: flex;
  align-items: center;
  padding: 16rpx 40rpx 32rpx;
}
.bento-grid-gap { margin-top: 8rpx; }
.bottom-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  width: 100%;
  padding: 32rpx 0 16rpx;
  box-sizing: border-box;
}
.bottom-link-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-coral);
  line-height: 1.4;
}
.bottom-link-chev {
  font-size: 32rpx;
  line-height: 1;
  color: var(--color-coral);
  opacity: 0.7;
}
</style>