<script setup>
import NavBar from '@/components/NavBar.vue'

function generate() {
  uni.redirectTo({ url: '/subpackages/wizard/loading' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="确认信息" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
    </view>

    <view class="screen-body">
      <view class="glass-card kv-list">
        <view class="kv-row"><text>月收入</text><text class="kv-val">¥32,000</text></view>
        <view class="kv-row"><text>固定支出</text><text class="kv-val">¥14,300</text></view>
        <view class="kv-row"><text>储蓄目标</text><text class="kv-val">¥6,400</text></view>
        <view class="kv-row kv-row-highlight"><text>可支配</text><text class="kv-val">¥11,300</text></view>
      </view>

      <text class="hint-text hint-text-center">免费版这个月还能再测 1 次</text>

      <button class="grad-btn" @tap="generate">生成我们的家庭规划书</button>
    </view>
  </view>
</template>
