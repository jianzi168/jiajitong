<script setup>
import NavBar from '@/components/NavBar.vue'
import { ref } from 'vue'

const stability = ref('稳定')
const options = ['稳定', '含奖金', '一方波动']

function next() {
  uni.navigateTo({ url: '/subpackages/wizard/step3' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
      <view class="seg"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body">
      <text class="field-heading">所在城市</text>
      <view class="field-block select-field">
        <text>上海</text>
        <text class="chev">▼</text>
      </view>

      <text class="field-heading">家庭月收入（税后）</text>
      <view class="field-row">
        <view class="field-block money-field money-field-sm">
          <text>我的</text>
          <text class="field-input">18,000</text>
        </view>
        <view class="field-block money-field money-field-sm">
          <text>配偶</text>
          <text class="field-input">14,000</text>
        </view>
      </view>
      <text class="hint-text hint-text-accent">合计 ¥32,000</text>

      <text class="field-heading">收入稳不稳？</text>
      <view class="pill-group">
        <view
          v-for="o in options"
          :key="o"
          class="pill-option"
          :class="{ selected: stability === o }"
          @tap="stability = o"
        >
          <text>{{ o }}</text>
        </view>
      </view>

      <button class="grad-btn" @tap="next">下一步</button>
    </view>
  </view>
</template>
