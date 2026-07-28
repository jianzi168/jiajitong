<script setup>
import { computed, onShow } from 'vue'
import FloatNav from '@/components/FloatNav.vue'
import { usePlanStore } from '@/stores/plan'

const store = usePlanStore()
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20

const hasPlan = computed(() => store.hasPlan)
const health = computed(() => store.healthScore)
const monthly = computed(() => store.monthlySummary || {})
const baby = computed(() => store.babyReserve)
const recs = computed(() => store.recommendations.slice(0, 2))
const nickname = computed(() => uni.getStorageSync('nickname') || '我的家庭')

onShow(async () => {
  try {
    await store.loadActive()
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
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <text class="page-title">{{ nickname }}的家庭</text>
      <text class="text-link" @tap="onRecalc">重新测算</text>
    </view>

    <view class="screen-body screen-body-scroll screen-body-tab">
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
          <text class="glass-value-sm">
            ¥{{ monthly.savings_actual || 0 }} / ¥{{ monthly.savings_target || 0 }}
          </text>
          <view class="track-bar">
            <view
              class="track-fill track-fill-warn"
              :style="{ width: monthly.savings_target ? Math.min(100, Math.round((monthly.savings_actual / monthly.savings_target) * 100)) + '%' : '0%' }"
            ></view>
          </view>
          <text class="cell-meta">
            {{ monthly.savings_target ? Math.round((monthly.savings_actual / monthly.savings_target) * 100) : 0 }}%
          </text>
        </view>

        <view v-if="baby" class="bento-cell glass-card">
          <text class="glass-label">备育储备</text>
          <text class="glass-value-sm">
            ¥{{ baby.current || 0 }} / ¥{{ baby.target || 0 }}
          </text>
          <view class="track-bar">
            <view
              class="track-fill"
              :style="{ width: baby.target ? Math.min(100, Math.round((baby.current / baby.target) * 100)) + '%' : '0%' }"
            ></view>
          </view>
          <text class="cell-meta">{{ baby.target ? Math.round((baby.current / baby.target) * 100) : 0 }}%</text>
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
        <text class="tip-p">{{ r.desc || '' }}</text>
      </view>
    </view>

    <FloatNav active="home" />
  </view>
</template>

<style>
.simple-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 40rpx;
}
.tip-p {
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.5;
}
</style>