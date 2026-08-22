<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import ScoreRing from '@/components/ScoreRing.vue'
import NavBar from '@/components/NavBar.vue'
import { getActivePlan } from '@/services/api'
import { usePlanStore } from '@/stores/plan'

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)
const activating = ref(false)

const planStore = usePlanStore()

onMounted(async () => {
  // 优先从云端 plan.getActive 拉 (Phase 6)
  try {
    const r = await getActivePlan()
    if (r && r.plan) {
      plan.value = r.plan
      planStore.activePlan = r.plan
      planStore.activated = !!r.plan.activated_at
      loading.value = false
      return
    }
  } catch (e) {
    console.warn('[preview] cloud getActive failed:', e)
  }
  // fallback: 从 globalData 读 (Phase 5 行为)
  const app = getApp()
  plan.value = (app && app.globalData && app.globalData.fullPlanResult) || null
  if (!plan.value) {
    errorMsg.value = '未找到规划数据，请回到向导重新生成'
  } else if (planStore.activated || plan.value.activated_at) {
    planStore.activated = true
  }
  loading.value = false
})

const isActivated = computed(() =>
  !!(planStore.activated || (plan.value && plan.value.activated_at))
)

const riskLabel = computed(() => ({
  green: '稳健',
  yellow: '关注',
  red: '需调整',
}[plan.value?.risk_level] || '—'))

const disposable = computed(() => plan.value?.monthly_summary?.disposable || 0)

// Phase 10 商业化关闭：全量展示，不再按订阅截断
const visibleCategories = computed(() => {
  const all = plan.value?.categories || []
  return { shown: all, hidden: [] }
})

const recommendations = computed(() => {
  return plan.value?.recommendations || []
})

const visibleRecommendations = computed(() => recommendations.value)

const babySection = computed(() => {
  if (!plan.value?.baby_reserve) return null
  const b = plan.value.baby_reserve
  const target = Number(b.target) || 0
  const current = Number(b.current) || 0
  const monthlyRequired = Number(b.monthlyRequired) || 0
  const monthsRemaining = Number(b.monthsRemaining) || 0
  return {
    full: true,
    target,
    current,
    monthlyRequired,
    monthsRemaining,
    pressureRatio: b.pressureRatio,
  }
})

const riskReport = computed(() => plan.value?.risk_report || {})

function fmt(n) {
  return '¥' + Number(n || 0).toLocaleString('en-US')
}
function pct(n) {
  return (n * 100).toFixed(1) + '%'
}

// Phase 10 商业化关闭：支付入口已屏蔽（原 onUnlock 跳 /pages/paywall/index）
function onFullReport() {
  uni.navigateTo({ url: '/subpackages/report/full' })
}

function goDashboard() {
  uni.reLaunch({ url: '/pages/dashboard/index' })
}

async function onActivate() {
  if (activating.value) return
  if (isActivated.value) {
    goDashboard()
    return
  }
  activating.value = true
  uni.showLoading({ title: '启用中...' })
  try {
    await planStore.activate(plan.value)
    if (plan.value) plan.value = { ...plan.value, activated_at: Date.now() }
    uni.hideLoading()
    uni.showToast({ title: '已启用追踪', icon: 'success' })
    setTimeout(goDashboard, 600)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || e.message || '启用失败', icon: 'none' })
  } finally {
    activating.value = false
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划书" />

    <ScreenBody class="screen-body-scroll report-body">
      <template v-if="loading">
        <text class="loading-text">加载中…</text>
      </template>

      <template v-else-if="errorMsg">
        <text class="error-text">{{ errorMsg }}</text>
      </template>

      <template v-else>
        <!-- 1. 封面：健康分 + 评级 -->
        <view class="report-cover glass-card">
          <ScoreRing :score="plan.health_score" size="lg" />
          <text class="cover-caption">家庭财务健康分</text>
          <text class="status-pill" :class="'status-pill-' + plan.risk_level">
            {{ riskLabel }} 区间
          </text>
          <text class="cover-meta">{{ plan.meta?.city || '' }} · {{ plan.meta?.stage || '' }}</text>
        </view>

        <!-- 2. 收支总览 -->
        <view class="report-section">
          <text class="section-title">收支总览</text>
          <view class="kv-list">
            <view class="kv-row">
              <text>月收入</text>
              <text class="kv-val">{{ fmt(plan.monthly_summary.income) }}</text>
            </view>
            <view class="kv-row">
              <text>固定支出</text>
              <text class="kv-val">{{ fmt(plan.monthly_summary.fixed_expense) }}</text>
            </view>
            <view class="kv-row">
              <text>储蓄目标</text>
              <text class="kv-val">{{ fmt(plan.monthly_summary.savings_target) }}</text>
            </view>
            <view class="kv-row kv-row-highlight">
              <text>可支配</text>
              <text class="kv-val">{{ fmt(disposable) }}</text>
            </view>
          </view>
        </view>

        <!-- 3. 月度预算建议表 -->
        <view class="report-section">
          <text class="section-title">月度预算建议</text>
          <view class="budget-list">
            <view v-for="c in visibleCategories.shown" :key="c.id" class="budget-row">
              <text class="budget-name">{{ c.name }}</text>
              <text class="budget-val">{{ fmt(c.suggested) }}</text>
              <text class="budget-pct">{{ pct(c.ratio) }}</text>
            </view>
          </view>
        </view>

        <!-- 4. 备育专项 -->
        <view v-if="babySection" class="report-section">
          <text class="section-title">备育专项</text>
          <view class="kv-list">
            <view class="kv-row"><text>推荐储备金</text><text class="kv-val">{{ fmt(babySection.target) }}</text></view>
            <view class="kv-row"><text>当前已存</text><text class="kv-val">{{ fmt(babySection.current) }}</text></view>
            <view v-if="babySection.full" class="kv-row kv-row-highlight">
              <text>距生育 {{ babySection.monthsRemaining }} 月</text>
              <text class="kv-val">每月需 {{ fmt(babySection.monthlyRequired) }}</text>
            </view>
          </view>
        </view>

        <!-- 5. 优化建议 -->
        <view v-if="recommendations.length" class="report-section">
          <text class="section-title">优化建议</text>
          <view class="rec-list">
            <view v-for="(r, i) in visibleRecommendations" :key="i" class="rec-card">
              <text class="rec-title">{{ r.title || '建议 ' + (i+1) }}</text>
              <text class="rec-desc">{{ r.description || r.text || '' }}</text>
            </view>
          </view>
        </view>

        <!-- 6. 抗风险报告 -->
        <view class="report-section">
          <text class="section-title">抗风险报告</text>
          <view class="kv-list">
            <view class="kv-row">
              <text>储蓄率</text>
              <text class="kv-val">{{ pct(plan.monthly_summary.savings_target / plan.monthly_summary.income) }}</text>
            </view>
            <view class="kv-row">
              <text>固定占比</text>
              <text class="kv-val">{{ pct(plan.monthly_summary.fixed_expense / plan.monthly_summary.income) }}</text>
            </view>
            <view class="kv-row">
              <text>备用金</text>
              <text class="kv-val">{{ plan.meta ? plan.meta.income_coefficient?.toFixed(2) : '—' }} 系数</text>
            </view>
          </view>
        </view>

        <!-- 7. 下一步行动 -->
        <view class="report-section">
          <text class="section-title">下一步</text>
          <button class="grad-btn" :disabled="activating" @tap="onActivate">
            {{ isActivated ? '查看预算看板' : (activating ? '启用中…' : '启用预算追踪') }}
          </button>
          <button class="text-link" @tap="onFullReport">查看完整规划书</button>
        </view>
      </template>
    </ScreenBody>
  </view>
</template>

<style>
.report-body .screen-body-inner { padding-top: 24rpx; padding-bottom: 48rpx; }
.report-cover {
  padding: 32rpx 24rpx;
  text-align: center;
  margin-bottom: 32rpx;
}
.cover-caption {
  display: block;
  font-size: 28rpx;
  color: var(--color-text-2);
  margin-top: 16rpx;
}
.cover-meta {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
  margin-top: 8rpx;
}
.report-section {
  margin-bottom: 32rpx;
}
.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16rpx;
}
.kv-list {
  background: rgba(255, 255, 255, 0.7);
  border-radius: 16rpx;
  padding: 8rpx 24rpx;
}
.kv-row {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(0,0,0,0.04);
  font-size: 28rpx;
}
.kv-row:last-child { border-bottom: none; }
.kv-row-highlight { font-weight: 700; color: #FF6B8A; }
.kv-val { font-variant-numeric: tabular-nums; }
.budget-list { background: rgba(255,255,255,0.7); border-radius: 16rpx; padding: 16rpx 24rpx; }
.budget-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  font-size: 28rpx;
}
.budget-row.blurred { filter: blur(6rpx); opacity: 0.5; }
.budget-name { flex: 1; }
.budget-val { font-variant-numeric: tabular-nums; }
.budget-pct { color: var(--color-text-2); font-size: 24rpx; margin-left: 16rpx; }
.budget-locked { position: relative; }
.unlock-cta {
  text-align: center;
  padding: 16rpx;
  margin-top: 12rpx;
  background: rgba(255, 107, 138, 0.1);
  color: #FF6B8A;
  border-radius: 8rpx;
  font-size: 26rpx;
}
.rec-card {
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12rpx;
  padding: 16rpx;
  margin-bottom: 12rpx;
}
.rec-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 8rpx; }
.rec-desc { display: block; font-size: 24rpx; color: var(--color-text-2); line-height: 1.5; }
.loading-text, .error-text { padding: 48rpx; text-align: center; color: var(--color-text-2); }
</style>