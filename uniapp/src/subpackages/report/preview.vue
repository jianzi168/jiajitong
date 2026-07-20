<script setup>
import { ref, computed, onMounted } from 'vue'
import ScoreRing from '@/components/ScoreRing.vue'
import NavBar from '@/components/NavBar.vue'

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)

// Free 权益（PDD §5.3）：仅显示 2 类预算 + 1 条建议 + 摘要备育
const FREE_VISIBLE_CATEGORIES = 2
const FREE_VISIBLE_RECOMMENDATIONS = 1

onMounted(() => {
  const app = getApp()
  plan.value = (app && app.globalData && app.globalData.fullPlanResult) || null
  if (!plan.value) {
    errorMsg.value = '未找到规划数据，请回到向导重新生成'
  }
  loading.value = false
})

const riskLabel = computed(() => ({
  green: '稳健',
  yellow: '关注',
  red: '需调整',
}[plan.value?.risk_level] || '—'))

const disposable = computed(() => plan.value?.monthly_summary?.disposable || 0)

const visibleCategories = computed(() => {
  const all = plan.value?.categories || []
  return {
    shown: all.slice(0, FREE_VISIBLE_CATEGORIES),
    hidden: all.slice(FREE_VISIBLE_CATEGORIES),
  }
})

const recommendations = computed(() => plan.value?.recommendations || [])

const babySection = computed(() => {
  if (!plan.value?.baby_reserve) return null
  const b = plan.value.baby_reserve
  return {
    target: b.target,
    current: b.current,
    monthlyRequired: b.monthlyRequired,
    monthsRemaining: b.monthsRemaining,
    pressureRatio: b.pressureRatio,
    // Free 摘要：仅显示 total + progress，不显示 detailed plan
    summary: `推荐储备 ¥${b.target.toLocaleString('en-US')}，当前已存 ¥${b.current.toLocaleString('en-US')}`,
  }
})

const riskReport = computed(() => plan.value?.risk_report || {})

function fmt(n) {
  return '¥' + Number(n || 0).toLocaleString('en-US')
}
function pct(n) {
  return (n * 100).toFixed(1) + '%'
}

function onUnlock() {
  // Phase 5: 跳到完整版（待 Phase 8 接支付后改为付费引导）
  uni.navigateTo({ url: '/subpackages/report/full' })
}

function onActivate() {
  uni.showToast({ title: '待接入追踪（Phase 7）', icon: 'none' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划书" />

    <view class="screen-body screen-body-scroll report-body">
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
            <view v-if="visibleCategories.hidden.length" class="budget-locked">
              <view v-for="c in visibleCategories.hidden" :key="c.id" class="budget-row blurred">
                <text class="budget-name">{{ c.name }}</text>
                <text class="budget-val">{{ fmt(c.suggested) }}</text>
                <text class="budget-pct">{{ pct(c.ratio) }}</text>
              </view>
              <view class="unlock-cta" @tap="onUnlock">
                <text>🔒 解锁完整 7 类预算</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 4. 备育专项 -->
        <view v-if="babySection" class="report-section">
          <text class="section-title">备育专项</text>
          <view class="kv-list">
            <view class="kv-row"><text>推荐储备金</text><text class="kv-val">{{ fmt(babySection.target) }}</text></view>
            <view class="kv-row"><text>当前已存</text><text class="kv-val">{{ fmt(babySection.current) }}</text></view>
            <view class="kv-row kv-row-highlight">
              <text>距生育 {{ babySection.monthsRemaining }} 月</text>
              <text class="kv-val">每月需 ¥{{ babySection.monthlyRequired.toLocaleString('en-US') }}</text>
            </view>
          </view>
        </view>

        <!-- 5. 优化建议 -->
        <view v-if="recommendations.length" class="report-section">
          <text class="section-title">优化建议</text>
          <view class="rec-list">
            <view v-for="(r, i) in recommendations.slice(0, FREE_VISIBLE_RECOMMENDATIONS)" :key="i" class="rec-card">
              <text class="rec-title">{{ r.title || '建议 ' + (i+1) }}</text>
              <text class="rec-desc">{{ r.description || r.text || '' }}</text>
            </view>
            <view v-if="recommendations.length > FREE_VISIBLE_RECOMMENDATIONS" class="unlock-cta" @tap="onUnlock">
              <text>🔒 解锁全部 {{ recommendations.length }} 条建议</text>
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
          <button class="grad-btn" @tap="onActivate">启用预算追踪</button>
          <button class="text-link" @tap="onUnlock">解锁完整版规划书</button>
        </view>
      </template>
    </view>
  </view>
</template>

<style>
.report-body { padding-top: 24rpx; padding-bottom: 48rpx; }
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