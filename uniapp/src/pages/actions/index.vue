<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { usePlanStore } from '@/stores/plan'
import { useSubscriptionStore } from '@/stores/subscription'

const planStore = usePlanStore()
const subStore = useSubscriptionStore()

const recStatus = ref({}) // { recId: 'accepted' | 'later' | 'ignored' }
const FREE_VISIBLE_RECS = 1

onMounted(async () => {
  try {
    const saved = uni.getStorageSync('recStatus') || {}
    recStatus.value = saved
  } catch (e) {}
  if (!planStore.activePlan) {
    try { await planStore.loadActive() } catch (e) {}
  }
})

onShow(async () => {
  try { await subStore.refresh() } catch (e) {}
})

const allRecs = computed(() => {
  return (planStore.activePlan && planStore.activePlan.recommendations) || []
})

const visibleRecs = computed(() => {
  if (subStore.canViewFull) return allRecs.value
  return allRecs.value.slice(0, FREE_VISIBLE_RECS)
})

const hiddenCount = computed(() => Math.max(0, allRecs.value.length - visibleRecs.value.length))

function severityClass(sev) {
  return 'sev-' + (sev || 'yellow')
}
function setStatus(recId, status) {
  recStatus.value = { ...recStatus.value, [recId]: status }
  try { uni.setStorageSync('recStatus', recStatus.value) } catch (e) {}
}
function statusOf(recId) {
  return recStatus.value[recId] || null
}
function goPaywall() {
  uni.navigateTo({ url: '/pages/paywall/index?from=actions' })
}
</script>

<template>
  <view class="screen">
    <view class="navbar-wrap">
      <NavBar title="行动清单" />
      <text class="header-caption header-caption-pos">
        {{ allRecs.length }} 条建议
      </text>
    </view>

    <view class="screen-body screen-body-scroll">
      <view v-if="!allRecs.length" class="empty-wrap">
        <text class="empty-title">还没有建议</text>
        <text class="empty-sub">先完成规划向导,这里会展示你的专属建议</text>
      </view>

      <view
        v-for="r in visibleRecs"
        :key="r.id"
        class="glass-card rec-card"
        :class="severityClass(r.severity)"
      >
        <view class="rec-head">
          <text class="rec-id">{{ r.id }}</text>
          <text class="rec-title">{{ r.title }}</text>
          <text v-if="statusOf(r.id)" class="rec-status">
            {{ statusOf(r.id) === 'accepted' ? '已采纳' : statusOf(r.id) === 'later' ? '稍后' : '已忽略' }}
          </text>
        </view>
        <text class="rec-desc">{{ r.description }}</text>
        <view v-if="r.actions && r.actions.length" class="rec-actions">
          <text class="actions-label">建议行动</text>
          <view v-for="(a, i) in r.actions" :key="i" class="rec-action-item">
            <text class="action-num">{{ i + 1 }}.</text>
            <text class="action-text">{{ a }}</text>
          </view>
        </view>
        <text v-if="r.estimatedImpact" class="rec-impact">预估影响：{{ r.estimatedImpact }}</text>
        <view class="tag-row">
          <view class="tag-btn" :class="statusOf(r.id) === 'accepted' ? 'active' : ''" @tap="setStatus(r.id, 'accepted')">采纳</view>
          <view class="tag-btn" :class="statusOf(r.id) === 'later' ? 'active' : ''" @tap="setStatus(r.id, 'later')">稍后</view>
          <view class="tag-btn" :class="statusOf(r.id) === 'ignored' ? 'active' : ''" @tap="setStatus(r.id, 'ignored')">忽略</view>
        </view>
      </view>

      <view v-if="hiddenCount > 0" class="unlock-cta" @tap="goPaywall">
        <text>🔒 解锁全部 {{ allRecs.length }} 条建议</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.navbar-wrap { position: relative; }
.header-caption-pos {
  position: absolute;
  right: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  color: var(--color-text-2);
  font-size: 24rpx;
}
.empty-wrap {
  display: flex; flex-direction: column;
  align-items: center; gap: 16rpx;
  padding: 96rpx 32rpx;
}
.empty-title { font-size: 32rpx; font-weight: 600; }
.empty-sub { font-size: 26rpx; color: var(--color-text-2); }

.rec-card { padding: 24rpx; margin-bottom: 16rpx; border-left: 8rpx solid #ccc; }
.rec-card.sev-red { border-left-color: #c33; }
.rec-card.sev-yellow { border-left-color: #F0B400; }
.rec-card.sev-green { border-left-color: #4CAF50; }
.rec-head { display: flex; align-items: center; margin-bottom: 8rpx; gap: 8rpx; }
.rec-id { font-size: 22rpx; padding: 2rpx 10rpx; border-radius: 4rpx; background: rgba(0,0,0,0.06); color: var(--color-text-2); flex-shrink: 0; }
.rec-title { flex: 1; font-size: 30rpx; font-weight: 700; }
.rec-status { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 999rpx; background: rgba(76,175,80,0.15); color: #2E7D32; flex-shrink: 0; }
.rec-desc { display: block; font-size: 26rpx; color: var(--color-text-2); line-height: 1.6; margin-bottom: 8rpx; }
.rec-actions { margin-top: 12rpx; }
.actions-label { display: block; font-size: 24rpx; font-weight: 600; margin-bottom: 8rpx; }
.rec-action-item { display: flex; gap: 8rpx; padding: 6rpx 0; font-size: 26rpx; color: var(--color-text-2); }
.action-num { flex-shrink: 0; font-weight: 600; }
.action-text { flex: 1; }
.rec-impact { display: block; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx dashed rgba(0,0,0,0.08); font-size: 24rpx; color: #FF6B8A; }
.tag-row { display: flex; gap: 12rpx; margin-top: 16rpx; }
.tag-btn { flex: 1; font-size: 24rpx; padding: 12rpx 0; border-radius: 8rpx; background: rgba(0,0,0,0.04); text-align: center; }
.tag-btn.active { background: linear-gradient(135deg, #FF6B8A, #FFB199); color: #fff; }
.unlock-cta {
  text-align: center;
  padding: 16rpx;
  margin: 16rpx 0;
  background: rgba(255, 107, 138, 0.1);
  color: #FF6B8A;
  border-radius: 8rpx;
  font-size: 26rpx;
}
</style>
