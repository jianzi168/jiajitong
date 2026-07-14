<script setup>
import { ref } from 'vue'
import ScoreRing from '@/components/ScoreRing.vue'
import NavBar from '@/components/NavBar.vue'

// 评分环已用 ScoreRing 组件；状态栏避让由 NavBar 处理
// 右侧分享入口：在 NavBar 外层自定义一个 navbar-action（NavBar 暂不支持插槽，故放在其下一行）
// 简化：用 text-link 浮在 NavBar 右侧，不改公共组件
const metrics = [
  { val: '20%', key: '储蓄率' },
  { val: '45%', key: '固定占比' },
  { val: '3.9月', key: '备用金' }
]

const summary = [
  { k: '月收入', v: '¥32,000' },
  { k: '固定支出', v: '¥14,300' },
  { k: '储蓄', v: '¥6,400' },
  { k: '可支配', v: '¥11,300' }
]

// 预算建议：前两行公开，后三行锁定（金额用 blur-lock + 解锁入口）
const budgets = [
  { name: '餐饮', amt: '¥3,600', pct: '11.2%', locked: false },
  { name: '日用', amt: '¥1,800', pct: '5.6%', locked: false },
  { name: '娱乐', amt: '¥2,000', pct: '', locked: true },
  { name: '医疗', amt: '¥1,200', pct: '', locked: true },
  { name: '服饰', amt: '¥900', pct: '', locked: true }
]

const tasks = [
  { label: '启用预算追踪', go: 'dashboard', done: true },
  { label: '邀请伴侣一起看', go: 'partner', done: false },
  { label: '设置周度填报提醒', go: 'setup-reminder', done: false }
]

function go(target) {
  const map = {
    paywall: '/pages/paywall/index',
    'report-full': '/subpackages/report/full',
    share: '/subpackages/report/share',
    dashboard: '/pages/dashboard/index',
    partner: '/pages/partner/index',
    'setup-reminder': '/pages/setup-reminder/index'
  }
  const url = map[target]
  if (!url) return
  if (target === 'dashboard') {
    uni.reLaunch({ url })
  } else {
    uni.navigateTo({ url })
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划书" />

    <view class="screen-body screen-body-scroll">
      <!-- 评分 hero -->
      <view class="report-hero">
        <ScoreRing :score="82" size="sm" />
        <view class="meta-line">
          <text class="status-pill status-pill-ok">稳健</text>
          <text>上海 · 备孕中</text>
        </view>
        <text class="report-date">生成于 2026-06-11</text>
      </view>

      <!-- 关键指标 -->
      <view class="metric-row">
        <view
          v-for="m in metrics"
          :key="m.key"
          class="metric-cell"
        >
          <text class="metric-val">{{ m.val }}</text>
          <text class="metric-key">{{ m.key }}</text>
        </view>
      </view>

      <text class="section-heading">收支总览</text>
      <view class="glass-card kv-list kv-list-compact">
        <view
          v-for="row in summary"
          :key="row.k"
          class="kv-row"
        >
          <text>{{ row.k }}</text>
          <text class="kv-val">{{ row.v }}</text>
        </view>
      </view>

      <text class="section-heading">月度预算建议</text>
      <view
        v-for="(b, i) in budgets"
        :key="i"
        class="budget-line"
      >
        <text>{{ b.name }}</text>
        <text v-if="!b.locked" class="budget-amt">{{ b.amt }}</text>
        <text v-else class="budget-amt blur-lock">{{ b.amt }}</text>
        <text v-if="!b.locked" class="budget-pct">{{ b.pct }}</text>
        <text
          v-else
          class="text-link"
          @tap="go('paywall')"
        >解锁</text>
      </view>

      <!-- 备育专项 teaser -->
      <view class="glass-card baby-panel baby-panel-teaser">
        <view class="section-heading-inline">
          <text class="section-heading" style="margin:0;">备育专项</text>
          <text class="status-pill status-pill-warn">摘要</text>
        </view>
        <text class="hint-text">首年育儿大概多 ¥3,200/月 · 储备进度 40%</text>
        <text class="text-link" @tap="go('paywall')">看完整备育规划 →</text>
      </view>

      <text class="section-heading">优化建议</text>
      <view class="glass-card glass-card-tip glass-card-accent-border">
        <text class="tip-strong">餐饮占比偏高</text>
        <text class="tip-p">外卖减到每周 ≤3 次，预计月省 ¥400–600。</text>
      </view>
      <view class="glass-card glass-card-locked">
        <text class="blur-lock blur-lock-text">还有 4 条专属建议…</text>
        <button class="grad-btn grad-btn-outline grad-btn-sm" @tap="go('paywall')">
          开通 Pro 看全部
        </button>
      </view>

      <text class="section-heading">接下来可以</text>
      <view class="task-list">
        <button
          v-for="t in tasks"
          :key="t.label"
          class="task-item"
          :class="{ 'task-item-done': t.done }"
          @tap="go(t.go)"
        >
          {{ t.label }}
        </button>
      </view>

      <view class="action-row">
        <button class="grad-btn grad-btn-outline" @tap="go('paywall')">¥19.9 完整报告</button>
        <button class="grad-btn grad-btn-outline" @tap="go('report-full')">预览完整版</button>
      </view>
    </view>
  </view>
</template>

<style>
/* NavBar 是 absolute 内嵌返回，右侧加分享入口需要外加一个浮层；这里改用 screen-body 内首行的 text-link 替代 */
.meta-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}
.meta-line .status-pill { margin-top: 0; }
.section-heading-inline { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx; }
.kv-list-compact .kv-row { padding: 20rpx 28rpx; }
.budget-line-locked { /* 原型有该 class 但我们直接通过 inline 条件渲染锁定态 */ }
</style>