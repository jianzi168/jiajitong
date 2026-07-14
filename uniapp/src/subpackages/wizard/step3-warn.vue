<script setup>
import NavBar from '@/components/NavBar.vue'

function next() {
  uni.redirectTo({ url: '/pages/error/imbalance' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body screen-body-scroll">
      <text class="field-heading">房贷或房租 *</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">28,000</text>
      </view>

      <view class="stat-strip stat-strip-warn">
        <text>固定支出 ¥29,500</text>
        <text>占收入 92.2%</text>
        <text class="status-pill status-pill-warn">偏高</text>
      </view>

      <button class="grad-btn" @tap="next">下一步</button>
    </view>
  </view>
</template>
