<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import FloatNav from '@/components/FloatNav.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { usePlanStore } from '@/stores/plan'
import { getFamilyMembers, adjustPlan } from '@/services/api'
import { getCapsuleSafeArea } from '@/utils/capsule'
import { trackPage } from '@/utils/analytics'

const store = usePlanStore()

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
const actionRowHeight = typeof uni.upx2px === 'function' ? uni.upx2px(80) : 40
const headerPlaceholder = statusBarHeight + navBarHeight + actionRowHeight

// Phase 10: 家庭成员协同（owner + members 头像组）
const familyMembers = ref([])
const familyLoaded = ref(false)

async function loadFamily() {
  try {
    const res = await getFamilyMembers()
    const list = []
    if (res && res.owner) list.push({ ...res.owner, _isOwner: true })
    ;(res && res.members ? res.members : []).forEach((m) => list.push({ ...m, _isOwner: false }))
    familyMembers.value = list
  } catch (e) {
    // 未登录 / 无家庭时静默
  } finally {
    familyLoaded.value = true
  }
}

const familySize = computed(() => familyMembers.value.length)
const hasPartner = computed(() => familySize.value >= 2)
const familyCaption = computed(() => {
  if (!familyLoaded.value) return ''
  return hasPartner.value ? `${familySize.value} 人共同管理` : '邀请伴侣一起管理'
})

function avatarText(m) {
  const n = (m.nickname || '').trim()
  if (n) return n.slice(0, 1)
  return m._isOwner ? '家' : '伴'
}

function onPartner() {
  uni.navigateTo({ url: '/pages/partner/index' })
}

// 当前月份显示文案（如 "7月预算"）
const monthLabel = computed(() => {
  const now = new Date()
  return `${now.getMonth() + 1}月预算`
})

const activated = computed(() => store.activated)
const hasPlan = computed(() => store.hasPlan)
const loading = computed(() => store.loading)
const dashboard = computed(() => store.dashboard || {})
const categories = computed(() => dashboard.value.categories || [])
const totals = computed(() => dashboard.value.totals || null)
const babyReserve = computed(() => dashboard.value.baby_reserve || null)

/**
 * 本周填报提醒（应用内）。
 *
 * 订阅消息推送依赖后台配置模板 ID，未配置时完全没有提醒；
 * 这条路径零配置即可生效，是「提醒用户记账」的最低门槛手段。
 */
const weekStatus = computed(() => dashboard.value.current_week || null)
const showWeeklyNudge = computed(
  () => !!(activated.value && weekStatus.value && !weekStatus.value.filled)
)

const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

const nudgeText = computed(() => {
  const w = weekStatus.value
  if (!w) return ''
  const wd = weekdayNames[w.weekday] || ''
  // days_left = 0 表示今天就是周日，本周要结束了
  if (w.days_left <= 0) return `今天是${wd}，本周还没记账，赶在周末前补上`
  return `今天是${wd}，本周还没记账，还剩 ${w.days_left} 天`
})

/**
 * 超支应用内预警（PDD：某类 ≥80% 显示警告态）。
 * 看板配色只给单条进度条着色，这里聚合出一条主动提醒，
 * 避免用户逐条找哪个快超了。订阅消息推送需后台配置模板，此路径零配置。
 */
const overspendCats = computed(() =>
  activated.value ? visibleCategories.value.filter((c) => c.pct >= 80) : []
)
const overspendText = computed(() => {
  const list = overspendCats.value
  if (!list.length) return ''
  return list.map((c) => `${c.name} 已用 ${c.pct}%`).join(' · ') + '，注意控制'
})

/**
 * 预算手动微调（PDD §15：计算透明化 + 可手动微调）。
 *
 * 交互设计：
 *  - 入口在「7 大类进度」标题右侧，已调整过会显示「已调整 · 微调」
 *  - 编辑态直接改数字，底部实时汇总；超可支配 → 保存禁用并红字提示
 *  - 非零和约束：合计 < 可支配意味着多储蓄，是用户选择而非错误
 *  - 规划变更属 owner 决策（member 可记账但不动规划），后端同样校验
 */
const isOwner = computed(() => {
  const list = familyMembers.value
  // 加载失败/无成员信息时不阻断入口 —— 后端 requireOwner 仍会兜底校验
  if (!list.length) return true
  return !!list[0]._isOwner
})
const isAdjusted = computed(() => !!(store.activePlan && store.activePlan.adjusted_at))

const editing = ref(false)
const editCats = ref([])
const savingEdit = ref(false)

function startEdit() {
  editCats.value = visibleCategories.value.map((c) => ({
    id: c.id,
    name: c.name,
    amount: String(c.suggested),
  }))
  editing.value = true
}
function cancelEdit() {
  editing.value = false
}

const editSum = computed(() =>
  editCats.value.reduce((s, c) => s + (Math.round(Number(c.amount)) || 0), 0)
)
const disposable = computed(() => (totals.value ? totals.value.suggested : 0))
const editRemain = computed(() => disposable.value - editSum.value)
const editOver = computed(() => editRemain.value < 0)

async function saveEdit() {
  if (editOver.value || savingEdit.value) return
  const categories = {}
  for (const c of editCats.value) {
    categories[c.id] = Math.max(0, Math.round(Number(c.amount)) || 0)
  }
  savingEdit.value = true
  try {
    uni.showLoading({ title: '保存中...' })
    await adjustPlan({ categories })
    await store.loadDashboard()
    uni.hideLoading()
    editing.value = false
    uni.showToast({ title: '已调整', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || e.message || '保存失败', icon: 'none' })
  } finally {
    savingEdit.value = false
  }
}

async function resetAdjust() {
  if (savingEdit.value) return
  savingEdit.value = true
  try {
    uni.showLoading({ title: '恢复中...' })
    await adjustPlan({ reset: true })
    await store.loadDashboard()
    uni.hideLoading()
    editing.value = false
    uni.showToast({ title: '已恢复引擎默认', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || e.message || '恢复失败', icon: 'none' })
  } finally {
    savingEdit.value = false
  }
}

// Phase 10 商业化关闭：7 类全量展示（原 free 只看前 2 类 + 锁定占位）
const visibleCategories = categories

onShow(async () => {
  trackPage('dashboard')
  try {
    await Promise.all([
      store.loadDashboard(),
      loadFamily(),
    ])
  } catch (e) {
    uni.showToast({ title: e.userHint || e.message || '加载失败', icon: 'none' })
  }
})

async function onActivate() {
  if (store.loading) return
  try {
    uni.showLoading({ title: '启用中...' })
    await store.activate()
    await store.loadDashboard()
    uni.hideLoading()
    uni.showToast({ title: '已启用追踪', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || e.message || '启用失败', icon: 'none' })
  }
}

function onWizard() {
  uni.navigateTo({ url: '/subpackages/wizard/step1' })
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
// Phase 10 商业化关闭：支付入口已屏蔽（原 onPaywall 跳 /pages/paywall/index 已移除）
</script>

<template>
  <view class="screen">
    <view class="dash-header">
      <view class="dash-header-status" :style="{ height: statusBarHeight + 'px' }"></view>
      <view
        class="dash-header-nav"
        :style="{
          height: navBarHeight + 'px',
          paddingRight: capsuleReserveRight + 'px',
        }"
      >
        <text class="page-title dash-title">{{ monthLabel }}</text>
      </view>
      <!-- 头像 / 副文案放在胶囊下方，避免与微信原生按钮重叠 -->
      <view class="dash-header-action">
        <text v-if="familyCaption" class="header-caption">{{ familyCaption }}</text>
        <view class="family-avatars" @tap="onPartner">
          <view
            v-for="(m, i) in familyMembers"
            :key="m.openid || i"
            class="family-avatar"
          >
            <image v-if="m.avatar" class="family-avatar-img" :src="m.avatar" mode="aspectFill" />
            <text v-else class="family-avatar-text">{{ avatarText(m) }}</text>
          </view>
          <view v-if="familyLoaded && !hasPartner" class="family-avatar family-avatar-add">
            <text class="family-avatar-add-text">＋</text>
          </view>
        </view>
      </view>
    </view>
    <view class="simple-header-placeholder" :style="{ height: headerPlaceholder + 'px' }"></view>

    <ScreenBody tab class="screen-body-scroll">
      <!-- 无方案：不能 activate，引导去向导 -->
      <view v-if="!loading && !hasPlan" class="empty-wrap">
        <text class="empty-title">还没有预算方案</text>
        <text class="empty-sub">先完成向导，生成家庭财务规划书后再启用追踪</text>
        <button class="grad-btn" @tap="onWizard">去生成方案</button>
      </view>

      <!-- 有方案未启用 -->
      <view v-else-if="!loading && !activated" class="empty-wrap">
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
        <!-- 本周未填报提醒：点击直达填报页 -->
        <view v-if="showWeeklyNudge" class="week-nudge" @tap="onWeekly">
          <view class="week-nudge-body">
            <text class="week-nudge-title">本周还没记账</text>
            <text class="week-nudge-sub">{{ nudgeText }}</text>
          </view>
          <text class="week-nudge-cta">去填报 ›</text>
        </view>

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

        <view class="section-heading-row">
          <text class="section-heading">7 大类进度</text>
          <text
            v-if="isOwner && activated"
            class="text-link adjust-link"
            @tap="editing ? cancelEdit() : startEdit()"
          >{{ editing ? '取消微调' : (isAdjusted ? '已调整 · 微调' : '微调') }}</text>
        </view>

        <!-- 超支应用内预警：任一类执行率 ≥80% -->
        <view v-if="!editing && overspendCats.length" class="overspend-alert">
          <text class="overspend-icon">⚠️</text>
          <text class="overspend-text">{{ overspendText }}</text>
        </view>

        <!-- 编辑态：直接改数字，实时汇总，超可支配禁用保存 -->
        <view v-if="editing" class="category-list">
          <view v-for="c in editCats" :key="c.id" class="category-cell edit-row">
            <text class="edit-name">{{ c.name }}</text>
            <input class="edit-input" type="number" v-model="c.amount" placeholder="0" />
            <text class="edit-unit">¥/月</text>
          </view>

          <view class="edit-summary" :class="{ over: editOver }">
            <text class="edit-summary-main">已分配 ¥{{ editSum }} / 可支配 ¥{{ disposable }}</text>
            <text v-if="editOver" class="edit-summary-sub warn">
              超出 ¥{{ -editRemain }}，请下调部分类目
            </text>
            <text v-else class="edit-summary-sub">剩余 ¥{{ editRemain }} 将计入储蓄</text>
          </view>

          <view class="edit-actions">
            <button class="grad-btn" :disabled="editOver || savingEdit" @tap="saveEdit">保存调整</button>
            <button
              v-if="isAdjusted"
              class="grad-btn grad-btn-outline"
              :disabled="savingEdit"
              @tap="resetAdjust"
            >恢复引擎默认</button>
          </view>
        </view>

        <!-- 展示态 -->
        <view v-else class="category-list">
          <view
            v-for="c in visibleCategories"
            :key="c.id"
            class="category-cell"
            @tap="onWeekly()"
          >
            <view class="cell-header">
              <text>{{ c.name }}</text>
              <text>¥{{ c.used }} / ¥{{ c.suggested }}</text>
            </view>
            <ProgressBar :pct="c.pct" :color="c.color" size="sm" />
          </view>
        </view>

        <!-- Phase 10 商业化关闭：Pro CTA 卡已移除（原 ¥68/年 解锁入口） -->

        <view class="action-row">
          <button class="grad-btn" @tap="onWeekly">填写本周支出</button>
          <button class="grad-btn grad-btn-outline" @tap="onActions">行动清单</button>
        </view>

        <view class="bottom-link" @tap="onReview">
          <text class="bottom-link-text">查看历史复盘</text>
          <text class="bottom-link-chev">›</text>
        </view>
      </view>
    </ScreenBody>

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
.dash-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(16rpx);
}
.dash-header-nav {
  display: flex;
  align-items: center;
  padding-left: 40rpx;
  box-sizing: border-box;
}
.dash-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.dash-header-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  padding: 8rpx 40rpx 16rpx;
  min-height: 80rpx;
  box-sizing: border-box;
}
/* Phase 10: 家庭成员头像协同区 */
.family-avatars {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.family-avatar {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: var(--grad-hero);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4rpx solid var(--color-surface);
  margin-left: -16rpx;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-soft);
}
.family-avatar:first-child { margin-left: 0; }
.family-avatar-img { width: 100%; height: 100%; }
.family-avatar-text { font-size: 26rpx; font-weight: 700; }
.family-avatar-add {
  background: rgba(0, 0, 0, 0.05);
  border: 2rpx dashed rgba(0, 0, 0, 0.18);
  box-shadow: none;
}
.family-avatar-add-text { color: var(--color-text-3); font-size: 30rpx; line-height: 1; }

/* 本周未填报提醒：可点击直达填报页 */
.week-nudge {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 20rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, rgba(255, 138, 92, 0.14), rgba(255, 107, 138, 0.10));
  border: 1rpx solid rgba(255, 138, 92, 0.22);
}
.week-nudge-body { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.week-nudge-title { font-size: 28rpx; font-weight: 600; color: var(--color-text); }
.week-nudge-sub { font-size: 24rpx; color: var(--color-text-2); line-height: 1.5; }
.week-nudge-cta {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-coral);
  flex-shrink: 0;
}

/* 微调入口行：标题 + 右侧链接 */
.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.adjust-link { font-size: 24rpx; }

/* 超支应用内预警 */
.overspend-alert {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 20rpx;
  border-radius: 20rpx;
  background: rgba(255, 138, 92, 0.12);
  border: 1rpx solid rgba(255, 138, 92, 0.28);
}
.overspend-icon { font-size: 26rpx; flex-shrink: 0; }
.overspend-text {
  flex: 1;
  font-size: 24rpx;
  color: var(--color-text);
  line-height: 1.6;
}

/* 预算微调编辑态 */
.edit-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.edit-name {
  flex: 1;
  font-size: 28rpx;
  color: var(--color-text);
}
.edit-input {
  width: 180rpx;
  padding: 10rpx 16rpx;
  border-radius: 12rpx;
  background: rgba(0, 0, 0, 0.04);
  border: 1rpx solid var(--color-border);
  font-size: 28rpx;
  text-align: right;
  color: var(--color-text);
}
.edit-unit {
  font-size: 22rpx;
  color: var(--color-text-3);
  width: 56rpx;
  flex-shrink: 0;
}
.edit-summary {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 24rpx;
  margin-top: 8rpx;
  border-radius: 20rpx;
  background: rgba(34, 197, 94, 0.08);
  border: 1rpx solid rgba(34, 197, 94, 0.2);
}
.edit-summary.over {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.3);
}
.edit-summary-main {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.edit-summary-sub {
  font-size: 24rpx;
  color: var(--color-text-2);
}
.edit-summary-sub.warn { color: #EF4444; }
.edit-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 20rpx;
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
.category-locked { opacity: 0.6; }
.lock-emoji { font-size: 22rpx; }
.lock-text { color: var(--color-coral); font-size: 24rpx; font-weight: 500; }
.locked-bar {
  height: 8rpx;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4rpx;
  margin-top: 4rpx;
}
.pro-cta {
  margin: 16rpx 24rpx;
  padding: 24rpx;
  text-align: center;
  background: linear-gradient(135deg, rgba(255, 107, 138, 0.1), rgba(255, 177, 153, 0.1));
  border: 2rpx solid rgba(255, 107, 138, 0.3);
}
.pro-cta-title { display: block; font-size: 30rpx; font-weight: 700; color: #FF6B8A; margin-bottom: 8rpx; }
.pro-cta-sub { display: block; font-size: 24rpx; color: var(--color-text-2); }
</style>