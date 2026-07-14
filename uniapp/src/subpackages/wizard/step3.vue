<script setup>
import NavBar from '@/components/NavBar.vue'

function next() {
  uni.navigateTo({ url: '/subpackages/wizard/step4' })
}

function showWarn() {
  uni.navigateTo({ url: '/subpackages/wizard/step3-warn' })
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
        <text class="field-input">11,000</text>
      </view>

      <text class="field-heading">车贷 / 停车</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">500</text>
      </view>

      <text class="field-heading">保险（含社保补充）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">800</text>
      </view>

      <text class="field-heading">赡养父母</text>
      <view class="field-block money-field">
        <text>¥</text>
        <text class="field-input">2,000</text>
      </view>

      <button class="text-link">+ 添加其他固定项</button>

      <view class="stat-strip stat-strip-ok">
        <text>固定支出 ¥14,300</text>
        <text>占收入 44.7%</text>
        <text class="status-pill status-pill-ok">正常</text>
      </view>

      <button class="grad-btn" @tap="next">下一步</button>
      <button class="text-link" @tap="showWarn">演示：占比过高</button>
    </view>
  </view>
</template>
