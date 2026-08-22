<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { usePlanStore } from '@/stores/plan'
import { getActionStatus, saveActionStatus } from '@/services/api'
import { track, trackPage } from '@/utils/analytics'

const planStore = usePlanStore()

const recStatus = ref({}) // { recId: 'accepted' | 'later' | 'ignored' }

onMounted(async () => {
  trackPage('actions')
  try {
    const saved = uni.getStorageSync('recStatus') || {}
    recStatus.value = saved
  } catch (e) {}
  // activePlan 缺失或为裁剪快照（缺 recommendations，如来自旧 dashboard 快照）→ 从云端补拉完整版
  const needFull = !planStore.activePlan ||
    !(planStore.activePlan.recommendations && planStore.activePlan.recommendations.length)
  if (needFull) {
    try { await planStore.loadActive() } catch (e) {}
  }
  // 兜底链：globalData（向导刚完成）→ 本地缓存（规划书页写入）→ 云端
  if (!planStore.activePlan || !(planStore.activePlan.recommendations && planStore.activePlan.recommendations.length)) {
    const app = getApp()
    const fallback = app?.globalData?.fullPlanResult
    if (fallback && fallback.health_score) {
      planStore.activePlan = fallback
    } else {
      try {
        const cached = uni.getStorageSync('activePlanCache')
        if (cached && cached.health_score && Array.isArray(cached.recommendations)) {
          planStore.activePlan = cached
        }
      } catch (e) {}
    }
  }
  // Phase 10: 云端采纳状态同步（云端优先；云端空但本地有 → 全量推送首次迁移）
  try {
    const cloud = await getActionStatus()
    const cloudMap = (cloud && cloud.statuses) || {}
    if (Object.keys(cloudMap).length) {
      recStatus.value = { ...recStatus.value, ...cloudMap }
      persistLocal(recStatus.value)
    } else if (Object.keys(recStatus.value).length) {
      for (const [k, v] of Object.entries(recStatus.value)) {
        await saveActionStatus({ rec_id: k, status: v }).catch(() => {})
      }
    }
  } catch (e) {
    // 云函数不可用时继续走 localStorage
  }
})

const allRecs = computed(() => {
  return (planStore.activePlan && planStore.activePlan.recommendations) || []
})

const hasActivePlan = computed(() => {
  return !!(planStore.activePlan && planStore.activePlan.health_score)
})

const visibleRecs = computed(() => {
  // Phase 10 商业化关闭：全量展示（原 free 只显示 1 条 + 解锁 CTA）
  return allRecs.value
})

const hiddenCount = computed(() => 0)

function severityClass(sev) {
  return 'sev-' + (sev || 'yellow')
}
function persistLocal(s) {
  try { uni.setStorageSync('recStatus', s) } catch (e) {}
}
function setStatus(recId, status) {
  const prev = recStatus.value
  recStatus.value = { ...prev, [recId]: status }
  persistLocal(recStatus.value)
  track('action_set', { recId, status })
  // 云端写入；失败回滚
  saveActionStatus({ rec_id: recId, status }).catch(() => {
    recStatus.value = prev
    persistLocal(prev)
    uni.showToast({ title: '保存失败，请检查网络', icon: 'none' })
  })
}
function statusOf(recId) {
  return recStatus.value[recId] || null
}
// Phase 10 商业化关闭：解锁 CTA 入口已移除（原 goPaywall 跳 /pages/paywall/index）
</script>

<template>
  <view class="screen">
    <NavBar title="行动清单" :rightText="allRecs.length + ' 条建议'" />

    <ScreenBody class="screen-body-scroll">
      <view v-if="!allRecs.length" class="empty-wrap">
        <template v-if="hasActivePlan">
          <text class="empty-title">当前财务状况很健康</text>
          <text class="empty-sub">暂无需要调整的风险建议，继续保持即可</text>
        </template>
        <template v-else>
          <text class="empty-title">还没有建议</text>
          <text class="empty-sub">先完成规划向导,这里会展示你的专属建议</text>
        </template>
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
    </ScreenBody>
  </view>
</template>

<style scoped>
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
