<script setup>
import NavBar from '@/components/NavBar.vue'

function next() {
  uni.navigateTo({ url: '/subpackages/wizard/step5' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body screen-body-scroll">
      <text class="field-heading">每月想存多少</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">6,400</text>
      </view>
      <text class="hint-text">一般建议存收入的 20% 左右</text>

      <text class="field-heading">应急金（已经存下的）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">50,000</text>
      </view>

      <view class="section-divider">备育专项</view>

      <view class="field-heading-row">
        <text class="field-heading" style="display:inline-block; margin-bottom:0;">推荐储备金</text>
        <text class="text-link text-link-inline">?</text>
      </view>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">80,000</text>
      </view>

      <text class="field-heading">计划什么时候生</text>
      <view class="field-block select-field">
        <text>2027 年 6 月</text>
        <text class="chev">▼</text>
      </view>

      <view class="glass-card glass-card-tip">
        <text><text class="tip-strong">距目标还有 18 个月 · 建议每月储备 ¥4,000</text></text>
      </view>

      <button class="grad-btn" @tap="next">下一步</button>
    </view>
  </view>
</template>

<style>
.field-heading-row { display: flex; align-items: baseline; gap: 12rpx; margin-bottom: 24rpx; }
</style>
