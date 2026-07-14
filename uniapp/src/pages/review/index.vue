<script setup>
import NavBar from '@/components/NavBar.vue'

const metrics = [
  { val: '87%', key: '执行率' },
  { val: '78→82', key: '健康分' }
]

const overspend = [
  { name: '1. 娱乐', amt: '+¥400', danger: true },
  { name: '2. 餐饮', amt: '+¥180', danger: true }
]

const surplus = [
  { name: '1. 医疗', amt: '-¥200', danger: false }
]

function onFullReport() {
  uni.navigateTo({ url: '/subpackages/report/full' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="5月复盘" />

    <view class="screen-body screen-body-scroll">
      <view class="glass-card">
        <view class="metric-row metric-row-flat">
          <view
            v-for="m in metrics"
            :key="m.key"
            class="metric-cell"
          >
            <text class="metric-val">{{ m.val }}</text>
            <text class="metric-key">{{ m.key }}</text>
          </view>
        </view>
      </view>

      <text class="section-heading">超支 Top</text>
      <view
        v-for="b in overspend"
        :key="b.name"
        class="budget-line"
      >
        <text>{{ b.name }}</text>
        <text class="budget-amt">{{ b.amt }}</text>
        <text
          class="budget-pct"
          :class="b.danger ? 'budget-pct-danger' : ''"
        >超支</text>
      </view>

      <text class="section-heading">结余 Top</text>
      <view
        v-for="b in surplus"
        :key="b.name"
        class="budget-line"
      >
        <text>{{ b.name }}</text>
        <text class="budget-amt">{{ b.amt }}</text>
        <text class="budget-pct">结余</text>
      </view>

      <view class="glass-card glass-card-tip">
        <text class="tip-strong">建议采纳效果</text>
        <text class="tip-p">餐饮优化已采纳，预计 6 月能省 ¥300。</text>
      </view>

      <button class="grad-btn grad-btn-outline" @tap="onFullReport">查看完整报告</button>
    </view>
  </view>
</template>

<style>
.tip-p {
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.5;
}
</style>
