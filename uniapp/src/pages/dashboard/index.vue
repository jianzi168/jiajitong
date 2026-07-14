<script setup>
import FloatNav from '@/components/FloatNav.vue'

// 状态栏高度 px → rpx（×2），给标题让出安全区
const statusBarHeight = (uni.getSystemInfoSync().statusBarHeight || 20) * 2

const categories = [
  { name: '餐饮', pill: '偏高', pillCls: 'status-pill-warn', used: '¥2,880', total: '3,600', pct: 80, fillCls: 'track-fill-warn' },
  { name: '日用', pill: '', pillCls: '', used: '¥900', total: '1,800', pct: 50, fillCls: 'track-fill-ok' },
  { name: '娱乐', pill: '已满', pillCls: 'status-pill-danger', used: '¥2,000', total: '2,000', pct: 100, fillCls: 'track-fill-danger' },
  { name: '医疗', pill: '', pillCls: '', used: '¥600', total: '1,200', pct: 50, fillCls: 'track-fill-ok' },
  { name: '服饰', pill: '', pillCls: '', used: '¥450', total: '900', pct: 50, fillCls: 'track-fill-ok' },
  { name: '交通通讯', pill: '', pillCls: '', used: '¥420', total: '600', pct: 70, fillCls: 'track-fill-warn' },
  { name: '其他', pill: '', pillCls: '', used: '¥366', total: '1,200', pct: 30, fillCls: 'track-fill-ok' }
]

function onReview() {
  uni.navigateTo({ url: '/pages/review/index' })
}
function onWeekly() {
  uni.navigateTo({ url: '/pages/weekly/index' })
}
function onActions() {
  uni.navigateTo({ url: '/pages/actions/index' })
}
</script>

<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'rpx' }">
      <text class="page-title">6月预算</text>
    </view>

    <view class="screen-body screen-body-scroll screen-body-tab">
      <view class="bento-grid bento-grid-gap">
        <view class="bento-cell bento-cell-wide glass-card">
          <text class="glass-label">可支配预算</text>
          <text class="glass-value">¥11,300</text>
          <view class="track-bar">
            <view class="track-fill track-fill-warn" style="width:68%"></view>
          </view>
          <text class="cell-meta">已用 68% · 剩 ¥3,616 · 12 天 · 日均 ¥301</text>
        </view>

        <view class="bento-cell glass-card">
          <text class="glass-label">本月储蓄</text>
          <text class="glass-value-sm">¥4,800 / ¥6,400</text>
          <view class="track-bar">
            <view class="track-fill track-fill-warn" style="width:75%"></view>
          </view>
          <text class="cell-meta">75%</text>
        </view>

        <view class="bento-cell glass-card">
          <text class="glass-label">备育储备</text>
          <text class="glass-value-sm">¥32,000 / ¥80,000</text>
          <view class="track-bar">
            <view class="track-fill" style="width:40%"></view>
          </view>
          <text class="cell-meta">40% · 距目标 18 个月</text>
        </view>
      </view>

      <text class="section-heading">7 大类进度</text>
      <view class="category-list">
        <view class="category-cell" v-for="(c, i) in categories" :key="i">
          <view class="cell-header">
            <text>
              {{ c.name }}
              <text v-if="c.pill" class="status-pill status-pill-xs" :class="c.pillCls">{{ c.pill }}</text>
            </text>
            <text>{{ c.used }}/{{ c.total }}</text>
          </view>
          <view class="track-bar track-bar-sm">
            <view class="track-fill" :class="c.fillCls" :style="{ width: c.pct + '%' }"></view>
          </view>
        </view>
      </view>

      <view class="action-row">
        <button class="grad-btn" @tap="onWeekly">填写本周支出</button>
        <button class="grad-btn grad-btn-outline" @tap="onActions">行动清单</button>
      </view>

      <view class="bottom-link" @tap="onReview">
        <text class="bottom-link-text">查看历史复盘</text>
        <text class="bottom-link-chev">›</text>
      </view>
    </view>

    <FloatNav active="dashboard" />
  </view>
</template>

<style>
.simple-header {
  display: flex;
  align-items: center;
  padding: 16rpx 40rpx 32rpx;
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
  display: inline-block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-coral);
  line-height: 1.4;
}
.bottom-link-chev {
  display: inline-block;
  font-size: 32rpx;
  line-height: 1;
  color: var(--color-coral);
  opacity: 0.7;
}
</style>

