<script setup>
import NavBar from '@/components/NavBar.vue'
import { ref } from 'vue'

const housing = ref('11,000')

function onHousingInput(e) {
  housing.value = e.detail.value
}

function onSeeResult() {
  uni.navigateTo({ url: '/pages/quick/result' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <view class="screen-body">
      <view class="step-pips step-pips-top">
        <view class="pip on"></view>
        <view class="pip on"></view>
        <view class="pip on"></view>
      </view>

      <text class="field-heading">房贷或房租（每月）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input class="field-input" type="text" :value="housing" @input="onHousingInput" />
      </view>

      <button class="grad-btn" @tap="onSeeResult">看看测算结果</button>
    </view>
  </view>
</template>
