<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import FloatNav from '@/components/FloatNav.vue'
import { usePlanStore } from '@/stores/plan'
import { getCapsuleSafeArea } from '@/utils/capsule'

const store = usePlanStore()

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
const actionRowHeight = typeof uni.upx2px === 'function' ? uni.upx2px(64) : 32
const headerPlaceholder = statusBarHeight + navBarHeight + actionRowHeight

const hasPlan = computed(() => store.hasPlan)
const health = computed(() => store.healthScore)
const baby = computed(() => store.babyReserve)
const recs = computed(() => store.recommendations.slice(0, 2))
const nickname = computed(() => uni.getStorageSync('nickname') || '我的家庭')

// 本月储蓄：需启用追踪、有周填报数据后才有实际值。
// 未启用时后端返回 actual: null，此处必须区分「存了 0 元」与「无数据」，
// 否则会把全部可支配收入谎报成已储蓄。
const savings = computed(() => store.savings)
const savingsTarget = computed(() => (savings.value ? savings.value.target : 0))
const hasSavingsData = computed(
  () => !!savings.value && savings.value.actual !== null
)

/**
 * 备育储备的一行状态文案：里程碑 + 达标预警。
 *
 * 里程碑来自后端 shapeBabyReserve（25/50/75/100 节点）；
 * on_track 由「实际储蓄速度」外推，而非 monthlyRequired ——
 * 那是按计划刚好达标的值，用它外推永远显示达标。
 */
const milestoneLine = computed(() => {
  const b = baby.value
  if (!b) return ''
  const parts = []

  // 备育倒计时（PDD §8.1 触达矩阵「备育倒计时提醒」的应用内部分）
  const monthsRemaining = Number(b.monthsRemaining) || 0
  if (monthsRemaining > 0) {
    parts.push(`距计划生育还有 ${monthsRemaining} 个月`)
  }

  if (b.next_milestone === null) {
    parts.push('目标已达成 🎉')
  } else {
    parts.push(`距下一节点还差 ${b.next_milestone - (b.pct || 0)}%`)
  }

  if (b.on_track === false) {
    const extra = b.extra_monthly
    parts.push(
      extra
        ? `按当前速度到生育时还差 ¥${b.gap}，每月需多存 ¥${extra}`
        : `已到生育时点，还差 ¥${b.gap}`
    )
  } else if (b.on_track === true) {
    parts.push('按当前速度可达标 ✓')
  }

  return parts.join(' · ')
})

onShow(async () => {
  try {
    // 用 loadDashboard 而非 loadActive：首页储蓄进度依赖本月已填报支出合计
    await store.loadDashboard()
    if (!store.hasPlan) {
      uni.reLaunch({ url: '/pages/home/empty' })
    }
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
})

function onRecalc() {
  uni.reLaunch({ url: '/subpackages/wizard/step1' })
}
function onGoReport() {
  uni.navigateTo({ url: '/subpackages/report/preview' })
}
function onGoActions() {
  uni.navigateTo({ url: '/pages/actions/index' })
}
</script>

<template>
  <view class="screen">
    <view class="home-header">
      <view class="home-header-status" :style="{ height: statusBarHeight + 'px' }"></view>
      <view
        class="home-header-nav"
        :style="{
          height: navBarHeight + 'px',
          paddingRight: capsuleReserveRight + 'px',
        }"
      >
        <text class="page-title home-title">{{ nickname }}的家庭</text>
      </view>
      <view class="home-header-action">
        <text class="recalc-link" @tap="onRecalc">重新测算</text>
      </view>
    </view>
    <view class="simple-header-placeholder" :style="{ height: headerPlaceholder + 'px' }"></view>

    <ScreenBody tab class="screen-body-scroll">
      <view class="bento-grid">
        <view class="bento-cell bento-cell-wide glass-card" @tap="onGoReport">
          <view class="score-inline">
            <text class="score-big">{{ health }}</text>
            <text>分</text>
            <text class="status-pill status-pill-ok">健康</text>
          </view>
          <text class="cell-link">查看完整规划书 ›</text>
        </view>

        <view class="bento-cell glass-card">
          <text class="glass-label">本月储蓄</text>
          <template v-if="hasSavingsData">
            <text class="glass-value-sm">
              ¥{{ savings.actual }} / ¥{{ savings.target }}
            </text>
            <ProgressBar :pct="savings.pct || 0" :color="savings.color || 'green'" />
            <text class="cell-meta">{{ savings.pct || 0 }}%</text>
          </template>
          <template v-else>
            <text class="glass-value-sm">— / ¥{{ savingsTarget }}</text>
            <text class="cell-meta">启用预算追踪后可见</text>
          </template>
        </view>

        <view v-if="baby" class="bento-cell glass-card">
          <text class="glass-label">备育储备</text>
          <text class="glass-value-sm">
            ¥{{ baby.current || 0 }} / ¥{{ baby.target || 0 }}
          </text>
          <ProgressBar :pct="baby.pct || 0" :color="baby.color || 'green'" />
          <text class="cell-meta">{{ milestoneLine }}</text>
        </view>
      </view>

      <text class="section-heading">待处理建议 ({{ recs.length }})</text>

      <view v-if="recs.length === 0" class="glass-card glass-card-tip">
        <text class="tip-strong">暂无建议</text>
        <text class="tip-p">完成向导后这里会显示你的专属建议。</text>
      </view>

      <view
        v-for="(r, i) in recs"
        :key="i"
        class="glass-card glass-card-tip"
        :class="{ 'glass-card-accent-border': i === 0 }"
        @tap="onGoActions"
      >
        <text class="tip-strong">{{ r.title || '建议' }}</text>
        <text class="tip-p">{{ r.description || '' }}</text>
      </view>
    </ScreenBody>

    <FloatNav active="home" />
  </view>
</template>

<style>
.home-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(250, 248, 245, 0.92);
  backdrop-filter: blur(16rpx);
}
.home-header-nav {
  display: flex;
  align-items: center;
  padding-left: 40rpx;
  box-sizing: border-box;
}
.home-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.home-header-action {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 40rpx 12rpx;
  min-height: 64rpx;
  box-sizing: border-box;
}
.recalc-link {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-coral);
  padding: 8rpx 4rpx;
  line-height: 1.2;
}
.tip-p {
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.5;
}
</style>
