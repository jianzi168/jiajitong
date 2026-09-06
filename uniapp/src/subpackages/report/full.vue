<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import ScoreRing from '@/components/ScoreRing.vue'
import { usePlanStore } from '@/stores/plan'
import { buildShareModel, drawSharePoster } from '@/utils/poster'
import { getPlanById } from '@/services/api'

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)
const recStatus = ref({}) // { recId: 'accepted' | 'later' | 'ignored' }
const activating = ref(false)
const planStore = usePlanStore()

// 从历史规划书进来时带 plan_id —— 此时必须按 id 取，
// 否则会退回 getActive 而显示当前方案（历史页白点）
const planId = ref('')

function readQuery(name) {
  try {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    const raw = (current && current.options && current.options[name]) || ''
    return decodeURIComponent(raw)
  } catch (e) {
    return ''
  }
}

const isHistoryView = computed(() => !!planId.value)

const isActivated = computed(() =>
  !!(planStore.activated || (plan.value && plan.value.activated_at))
)

async function loadPlanById(id) {
  const r = await getPlanById({ plan_id: id })
  if (r && r.plan) {
    plan.value = r.plan
    return true
  }
  return false
}

async function loadPlan() {
  // 0) 指定 plan_id（历史规划书入口）：优先级最高，直接取该版本
  if (planId.value) {
    return await loadPlanById(planId.value)
  }
  // 1) 同步: globalData（刚生成，优先级最高）
  const app = getApp()
  const fromGlobal = app && app.globalData && app.globalData.fullPlanResult
  if (fromGlobal) {
    plan.value = fromGlobal
    try { uni.setStorageSync('activePlanCache', fromGlobal) } catch (e) {}
    return true
  }
  // 2) 本地缓存
  try {
    const cached = uni.getStorageSync('activePlanCache')
    if (cached && cached._id) {
      plan.value = cached
      return true
    }
  } catch (e) {}
  // 3) 云端兜底：plans.getActive（与 dashboard 同源）
  try {
    const r = await planStore.loadActive()
    if (r && r._id) {
      plan.value = r
      try { uni.setStorageSync('activePlanCache', r) } catch (e) {}
      return true
    }
  } catch (e) {
    console.warn('[full] loadActive failed:', e)
  }
  return false
}

onMounted(async () => {
  planId.value = readQuery('plan_id')
  const ok = await loadPlan()
  if (!ok) {
    errorMsg.value = isHistoryView.value
      ? '未找到该版本的规划书'
      : '未找到规划数据，请回到向导重新生成'
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
    target: Number(b.target) || 0,
    current: Number(b.current) || 0,
    monthlyRequired: Number(b.monthlyRequired) || 0,
    monthsRemaining: Number(b.monthsRemaining) || 0,
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

function goDashboard() {
  uni.reLaunch({ url: '/pages/dashboard/index' })
}

async function onActivate() {
  if (activating.value) return
  // 历史版本是只读回看：在这儿点「启用」会把旧方案激活成当前方案，
  // 用户以为只是看看，实际把追踪基线换掉了
  if (isHistoryView.value) {
    uni.showToast({ title: '历史版本仅供回看，无法启用', icon: 'none' })
    return
  }
  if (isActivated.value) {
    goDashboard()
    return
  }
  activating.value = true
  uni.showLoading({ title: '启用中...' })
  try {
    await planStore.activate(plan.value)
    if (plan.value) {
      plan.value = { ...plan.value, activated_at: Date.now() }
      try { uni.setStorageSync('activePlanCache', plan.value) } catch (e) {}
    }
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
function onInvite() {
  uni.navigateTo({ url: '/pages/partner/index' })
}
function onExportPdf() {
  // Phase 10 商业化关闭：PDF 导出全量开放（原 Pro 门槛已移除）
  if (!plan.value) {
    uni.showToast({ title: '规划数据为空', icon: 'none' })
    return
  }

  uni.showLoading({ title: '生成中...' })

  const model = buildShareModel(plan.value, { scoreOnly: false })
  const canvasId = 'reportPdfCanvas'
  const fileName = `jiajitong-report-${plan.value._id || Date.now()}.png`

  drawSharePoster({ canvasId, model, qrImage: '', pageSize: 'a4' })
    .then(() => {
      uni.canvasToTempFilePath({
        canvasId,
        fileType: 'png',
        quality: 1,
        success: ({ tempFilePath }) => {
          const fm = wx.getFileSystemManager()
          const savePath = `${wx.env.USER_DATA_PATH}/${fileName}`
          fm.writeFile({
            filePath: savePath,
            data: tempFilePath,
            encoding: 'binary',
            success: () => {
              uni.openDocument({
                filePath: savePath,
                showMenu: true,
                success: () => {
                  uni.hideLoading()
                  uni.showToast({ title: '已生成 PDF', icon: 'success' })
                },
                fail: (e) => {
                  uni.hideLoading()
                  fallbackSaveImage(tempFilePath)
                },
              })
            },
            fail: (e) => {
              uni.hideLoading()
              fallbackSaveImage(tempFilePath)
            },
          })
        },
        fail: (e) => {
          uni.hideLoading()
          uni.showToast({ title: '生成图片失败', icon: 'none' })
        },
      })
    })
    .catch((e) => {
      uni.hideLoading()
      uni.showToast({ title: e.message || 'PDF 生成失败', icon: 'none' })
    })
}

function fallbackSaveImage(tempFilePath) {
  uni.getSetting({
    success: (res) => {
      if (res.authSetting['scope.writePhotosAlbum'] === false) {
        uni.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限以保存图片',
          confirmText: '去设置',
          success: (m) => { if (m.confirm) uni.openSetting() },
        })
        return
      }
      const doSave = () => {
        uni.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: () => uni.showToast({ title: '已保存为图片', icon: 'success' }),
          fail: (e) => uni.showToast({ title: '保存失败', icon: 'none' }),
        })
      }
      if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
        uni.authorize({ scope: 'scope.writePhotosAlbum', success: doSave, fail: () => {} })
      } else {
        doSave()
      }
    },
    fail: () => uni.showToast({ title: '保存失败', icon: 'none' }),
  })
}
function onShare() {
  uni.navigateTo({ url: '/subpackages/report/share' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划书（完整版）" />

    <ScreenBody class="screen-body-scroll report-body">
      <template v-if="loading">
        <text class="loading-text">加载中…</text>
      </template>
      <template v-else-if="errorMsg">
        <text class="error-text">{{ errorMsg }}</text>
      </template>

      <!-- Phase 10 商业化关闭：锁态屏已移除（完整报告全量开放） -->

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
              <text class="kv-val">每月 {{ fmt(baby.monthlyRequired) }}</text>
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
          <button class="grad-btn" :disabled="activating" @tap="onActivate">
            {{ isHistoryView ? '历史版本（只读）' : (isActivated ? '查看预算看板' : (activating ? '启用中…' : '启用预算追踪')) }}
          </button>
          <button class="text-link" @tap="onInvite">
            邀请伴侣共读
          </button>
          <button class="text-link" @tap="onExportPdf">
            导出 PDF
          </button>
          <button class="text-link" @tap="onShare">
            分享长图
          </button>
        </view>
      </template>
    </ScreenBody>

    <!-- PDF 导出用隐藏 canvas -->
    <canvas canvas-id="reportPdfCanvas" class="pdf-canvas" :style="{ width: '375px', height: '530px' }"></canvas>
  </view>
</template>

<style>
.report-body .screen-body-inner { padding-top: 24rpx; padding-bottom: 64rpx; }
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
.locked-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 48rpx 48rpx;
  text-align: center;
}
.lock-icon { font-size: 80rpx; margin-bottom: 24rpx; }
.lock-title { display: block; font-size: 36rpx; font-weight: 700; margin-bottom: 16rpx; color: var(--color-text); }
.lock-sub { display: block; font-size: 26rpx; color: var(--color-text-2); line-height: 1.6; margin-bottom: 32rpx; }
.lock-plans { margin-bottom: 32rpx; }
.lock-plan-item { display: block; font-size: 28rpx; color: #FF6B8A; font-weight: 600; margin: 8rpx 0; }
.pdf-canvas { position: fixed; left: -9999px; top: -9999px; }
</style>