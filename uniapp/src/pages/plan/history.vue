<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
// onShow 属于 uni-app 生命周期，必须从 @dcloudio/uni-app 导入（不是 vue）
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { listPlans } from '@/services/api'
import { toDateString } from '@/utils/datetime'

const loading = ref(true)
const errorMsg = ref('')
const plans = ref([])

onShow(async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const r = await listPlans()
    plans.value = (r && r.plans) || []
  } catch (e) {
    plans.value = []
    errorMsg.value = (e && e.userHint) || '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
})

const riskLabel = { green: '稳健', yellow: '关注', red: '需调整' }

/**
 * 只显示日期：toDateString() 已按业务时区(UTC+8)处理，
 * 不要在这里另写一套时间格式化 —— 那正是此前日期错位 bug 的来源。
 */
function dateLabel(ts) {
  if (!ts) return '—'
  try {
    return toDateString(new Date(ts))
  } catch (e) {
    return '—'
  }
}

function onOpen(p) {
  uni.navigateTo({
    url: `/subpackages/report/full?plan_id=${encodeURIComponent(p._id)}`,
  })
}
</script>

<template>
  <view class="screen">
    <NavBar title="历史规划书" />

    <ScreenBody class="screen-body-scroll">
      <view v-if="loading" class="state">
        <text class="state-sub">加载中…</text>
      </view>

      <view v-else-if="errorMsg" class="state">
        <text class="state-title">加载失败</text>
        <text class="state-sub">{{ errorMsg }}</text>
      </view>

      <view v-else-if="!plans.length" class="state">
        <text class="state-title">还没有历史规划书</text>
        <text class="state-sub">每完成一次测算都会留存一个版本，随时可以回看对比</text>
      </view>

      <template v-else>
        <text class="section-title">共 {{ plans.length }} 个版本</text>
        <view
          v-for="p in plans"
          :key="p._id"
          class="plan-card"
          @tap="onOpen(p)"
        >
          <view class="plan-head">
            <text class="plan-version">第 {{ p.version }} 版</text>
            <text v-if="p.is_active" class="plan-badge">当前</text>
            <text v-else class="plan-badge plan-badge-dim">历史</text>
          </view>
          <view class="plan-body">
            <view class="plan-metric">
              <text class="plan-score">{{ p.health_score }}</text>
              <text class="plan-metric-key">健康分</text>
            </view>
            <view class="plan-meta">
              <text class="plan-date">{{ dateLabel(p.created_at) }}</text>
              <text class="plan-risk">风险：{{ riskLabel[p.risk_level] || '稳健' }}</text>
            </view>
          </view>
          <text class="plan-chev">›</text>
        </view>
      </template>
    </ScreenBody>
  </view>
</template>

<style scoped>
.section-title {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-bottom: 16rpx;
}
.plan-card {
  position: relative;
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
  border-radius: 24rpx;
  background: var(--color-surface);
  border: 1rpx solid var(--color-border);
}
.plan-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.plan-version {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.plan-badge {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  background: rgba(255, 107, 138, 0.12);
  color: var(--color-coral);
}
.plan-badge-dim {
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-text-3);
}
.plan-body {
  display: flex;
  align-items: center;
  gap: 32rpx;
}
.plan-metric {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
}
.plan-score {
  font-size: 48rpx;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}
.plan-metric-key {
  font-size: 22rpx;
  color: var(--color-text-3);
}
.plan-meta {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.plan-date {
  font-size: 24rpx;
  color: var(--color-text-2);
}
.plan-risk {
  font-size: 22rpx;
  color: var(--color-text-3);
}
.plan-chev {
  position: absolute;
  right: 28rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 40rpx;
  color: var(--color-text-3);
}
.state {
  padding: 120rpx 40rpx;
  text-align: center;
}
.state-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12rpx;
}
.state-sub {
  display: block;
  font-size: 26rpx;
  color: var(--color-text-3);
  line-height: 1.6;
}
</style>
