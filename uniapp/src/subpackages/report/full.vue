<script setup>
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import ScoreRing from '@/components/ScoreRing.vue'

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)
const recStatus = ref({}) // { recId: 'accepted' | 'later' | 'ignored' }

onMounted(() => {
  const app = getApp()
  plan.value = (app && app.globalData && app.globalData.fullPlanResult) || null
  if (!plan.value) {
    errorMsg.value = '未找到规划数据，请回到向导重新生成'
  } else {
    // 从 localStorage 读已采纳状态
    try {
      const saved = uni.getStorageSync('recStatus') || {}
      recStatus.value = saved
    } catch (e) {}
  }
  loading.value = false
})

const riskLabel = computed(() => ({
  green: '稳健', yellow: '关注', red: '需调整',
}[plan.value?.risk_level] || '—'))

const disposable = computed(() => plan.value?.monthly_summary?.disposable || 0)

const recommendations = computed(() => plan.value?.recommendations || [])

const baby = computed(() => {
  const b = plan.value?.baby_reserve
  if (!b) return null
  return {
    target: b.target,
    current: b.current,
    monthlyRequired: b.monthlyRequired,
    monthsRemaining: b.monthsRemaining,
  }
})

const riskReport = computed(() => plan.value?.risk_report || {})

function fmt(n) {
  return '¥' + Number(n || 0).toLocaleString('en-US')
}
function pct(n) {
  return (n * 100).toFixed(1) + '%'
}
function severityClass(s) {
  return 'sev-' + (s || 'yellow')
}
function pctProgress(ratio) {
  if (!ratio || ratio >= 1) return 100
  return Math.round(ratio * 100)
}

function setStatus(recId, status) {
  recStatus.value = { ...recStatus.value, [recId]: status }
  try { uni.setStorageSync('recStatus', recStatus.value) } catch (e) {}
}
function statusOf(recId) {
  return recStatus.value[recId] || null
}

function fmtPct(num, denom) {
  if (!denom) return 0
  return Math.min(100, Math.round((num / denom) * 100))
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划书（完整版）" />

    <view class="screen-body screen-body-scroll report-body">
      <template v-if="loading">
        <text class="loading-text">加载中…</text>
      </template>
      <template v-else-if="errorMsg">
        <text class="error-text">{{ errorMsg }}</text>
      </template>

      <template v-else>
        <!-- 1. 封面 -->
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
            <view class="kv-row"><text>月收入</text><text class="kv-val">{{ fmt(plan.monthly_summary.income) }}</text></view>
            <view class="kv-row"><text>固定支出</text><text class="kv-val">{{ fmt(plan.monthly_summary.fixed_expense) }}</text></view>
            <view class="kv-row"><text>储蓄目标</text><text class="kv-val">{{ fmt(plan.monthly_summary.savings_target) }}</text></view>
            <view class="kv-row kv-row-highlight"><text>可支配</text><text class="kv-val">{{ fmt(disposable) }}</text></view>
          </view>
        </view>

        <!-- 3. 完整 7 类预算 -->
        <view class="report-section">
          <text class="section-title">月度预算建议（7 大类）</text>
          <view class="budget-list">
            <view v-for="c in plan.categories" :key="c.id" class="budget-row">
              <text class="budget-name">{{ c.name }}</text>
              <view class="budget-val-block">
                <text class="budget-val">{{ fmt(c.suggested) }}</text>
                <text class="budget-range">{{ fmt(c.range_min) }} – {{ fmt(c.range_max) }}</text>
              </view>
              <text class="budget-pct">{{ pct(c.ratio) }}</text>
            </view>
            <view v-if="plan.categories[0]?.calculation_basis" class="budget-basis">
              <text class="basis-label">计算依据</text>
              <text class="basis-text">{{ plan.categories[0].calculation_basis }}（其余类目同理）</text>
            </view>
          </view>
        </view>

        <!-- 4. 备育专项 -->
        <view v-if="baby" class="report-section">
          <text class="section-title">备育专项</text>
          <view class="kv-list">
            <view class="kv-row"><text>推荐储备金</text><text class="kv-val">{{ fmt(baby.target) }}</text></view>
            <view class="kv-row">
              <text>当前已存</text>
              <text class="kv-val">{{ fmt(baby.current) }}</text>
            </view>
            <view class="kv-row">
              <text>储备进度</text>
              <text class="kv-val">
                <view class="progress-bar">
                  <view class="progress-fill" :style="{ width: fmtPct(baby.current, baby.target) + '%' }"></view>
                </view>
                <text class="progress-text">{{ fmtPct(baby.current, baby.target) }}%</text>
              </text>
            </view>
            <view class="kv-row kv-row-highlight">
              <text>距生育 {{ baby.monthsRemaining }} 月</text>
              <text class="kv-val">每月 ¥{{ baby.monthlyRequired.toLocaleString('en-US') }}</text>
            </view>
          </view>
        </view>

        <!-- 5. 优化建议（完整） -->
        <view v-if="recommendations.length" class="report-section">
          <text class="section-title">优化建议 Top {{ recommendations.length }}</text>
          <view class="rec-list">
            <view
              v-for="r in recommendations"
              :key="r.id"
              class="rec-card"
              :class="severityClass(r.severity)"
            >
              <view class="rec-head">
                <text class="rec-id">{{ r.id }}</text>
                <text class="rec-title">{{ r.title }}</text>
                <text v-if="statusOf(r.id)" class="rec-status">{{ statusOf(r.id) === 'accepted' ? '已采纳' : statusOf(r.id) === 'later' ? '稍后' : '已忽略' }}</text>
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
              <view class="rec-buttons">
                <button class="btn-mini btn-accept" @tap="setStatus(r.id, 'accepted')">采纳</button>
                <button class="btn-mini btn-later" @tap="setStatus(r.id, 'later')">稍后</button>
                <button class="btn-mini btn-ignore" @tap="setStatus(r.id, 'ignored')">忽略</button>
              </view>
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
              <text>健康分</text>
              <text class="kv-val">{{ plan.health_score }} / 100</text>
            </view>
            <view v-if="riskReport.baby_too_soon" class="kv-row">
              <text>备育预警</text>
              <text class="kv-val kv-val-warn">{{ riskReport.baby_too_soon.message }}</text>
            </view>
            <view v-if="riskReport.city_estimated" class="kv-row">
              <text>城市估算</text>
              <text class="kv-val kv-val-warn">暂按新一线估算</text>
            </view>
          </view>
        </view>

        <!-- 7. 下一步 -->
        <view class="report-section">
          <text class="section-title">下一步行动</text>
          <button class="grad-btn" @tap="uni.showToast({title:'待接入追踪 (Phase 7)', icon:'none'})">
            启用预算追踪
          </button>
          <button class="text-link" @tap="uni.showToast({title:'邀请伴侣 (Phase 10)', icon:'none'})">
            邀请伴侣共读
          </button>
          <button class="text-link" @tap="uni.showToast({title:'PDF 导出 (Phase 8)', icon:'none'})">
            导出 PDF
          </button>
        </view>
      </template>
    </view>
  </view>
</template>

<style>
.report-body { padding-top: 24rpx; padding-bottom: 64rpx; }
.report-cover {
  padding: 40rpx 24rpx;
  text-align: center;
  margin-bottom: 32rpx;
}
.cover-caption { display: block; font-size: 28rpx; color: var(--color-text-2); margin-top: 16rpx; }
.cover-meta { display: block; font-size: 24rpx; color: var(--color-text-2); margin-top: 8rpx; }
.report-section { margin-bottom: 32rpx; }
.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16rpx;
}
.kv-list { background: rgba(255, 255, 255, 0.7); border-radius: 16rpx; padding: 8rpx 24rpx; }
.kv-row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); font-size: 28rpx; gap: 16rpx; }
.kv-row:last-child { border-bottom: none; }
.kv-row-highlight { font-weight: 700; color: #FF6B8A; }
.kv-val { font-weight: 700; flex-shrink: 0; text-align: right; word-break: break-all; }
.kv-val-warn { color: #c33; font-weight: 600; font-size: 24rpx; }
.budget-list { background: rgba(255,255,255,0.7); border-radius: 16rpx; padding: 16rpx 24rpx; }
.budget-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(0,0,0,0.04);
  font-size: 28rpx;
  gap: 16rpx;
}
.budget-row:last-of-type { border-bottom: none; }
.budget-name { flex: 0 0 auto; }
.budget-val-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.budget-val { font-weight: 700; font-variant-numeric: tabular-nums; }
.budget-range { font-size: 22rpx; color: var(--color-text-2); margin-top: 4rpx; }
.budget-pct { flex: 0 0 auto; color: var(--color-text-2); font-size: 24rpx; min-width: 80rpx; text-align: right; }
.budget-basis { margin-top: 12rpx; padding-top: 16rpx; border-top: 1rpx solid rgba(0,0,0,0.06); }
.basis-label { display: block; font-size: 22rpx; color: var(--color-text-2); margin-bottom: 6rpx; }
.basis-text { display: block; font-size: 22rpx; color: var(--color-text-3); line-height: 1.5; }
.progress-bar { display: inline-block; width: 120rpx; height: 12rpx; background: rgba(0,0,0,0.08); border-radius: 6rpx; overflow: hidden; vertical-align: middle; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #FF6B8A, #FFB199); }
.progress-text { font-size: 22rpx; color: var(--color-text-2); margin-left: 8rpx; }
.rec-list { display: flex; flex-direction: column; gap: 16rpx; }
.rec-card {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16rpx;
  padding: 24rpx;
  border-left: 8rpx solid #ccc;
}
.rec-card.sev-red { border-left-color: #c33; }
.rec-card.sev-yellow { border-left-color: #F0B400; }
.rec-card.sev-green { border-left-color: #4CAF50; }
.rec-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
  gap: 8rpx;
}
.rec-id { font-size: 22rpx; padding: 2rpx 10rpx; border-radius: 4rpx; background: rgba(0,0,0,0.06); color: var(--color-text-2); flex-shrink: 0; }
.rec-title { flex: 1; font-size: 30rpx; font-weight: 700; }
.rec-status { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 999rpx; background: rgba(76,175,80,0.15); color: #2E7D32; flex-shrink: 0; }
.rec-desc { display: block; font-size: 26rpx; color: var(--color-text-2); line-height: 1.6; margin-bottom: 12rpx; }
.rec-actions { margin-top: 12rpx; }
.actions-label { display: block; font-size: 24rpx; font-weight: 600; color: var(--color-text); margin-bottom: 8rpx; }
.rec-action-item { display: flex; gap: 8rpx; padding: 6rpx 0; font-size: 26rpx; color: var(--color-text-2); }
.action-num { flex-shrink: 0; font-weight: 600; color: var(--color-text); }
.action-text { flex: 1; }
.rec-impact { display: block; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx dashed rgba(0,0,0,0.08); font-size: 24rpx; color: var(--color-coral, #FF6B8A); }
.rec-buttons { display: flex; gap: 12rpx; margin-top: 16rpx; }
.btn-mini { flex: 1; font-size: 24rpx; padding: 12rpx 0; border-radius: 8rpx; border: none; }
.btn-accept { background: linear-gradient(135deg, #FF6B8A, #FFB199); color: #fff; }
.btn-later { background: rgba(0,0,0,0.04); color: var(--color-text); }
.btn-ignore { background: transparent; color: var(--color-text-2); border: 1rpx solid rgba(0,0,0,0.1); }
.btn-mini::after { border: none; }
.loading-text, .error-text { padding: 48rpx; text-align: center; color: var(--color-text-2); }
</style>