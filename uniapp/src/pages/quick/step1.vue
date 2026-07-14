<script setup>
import NavBar from '@/components/NavBar.vue'

function onNext() {
  uni.navigateTo({ url: '/pages/quick/step2' })
}

function onCityNotCovered() {
  uni.navigateTo({ url: '/pages/error/city' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <view class="screen-body">
      <view class="step-pips step-pips-top">
        <view class="pip on"></view>
        <view class="pip"></view>
        <view class="pip"></view>
      </view>

      <text class="field-heading">你们住在哪？</text>
      <view class="field-block select-field">
        <text>上海</text>
        <text class="chev">▼</text>
      </view>

      <button class="grad-btn" @tap="onNext">下一步</button>
      <button class="text-link" @tap="onCityNotCovered">演示：城市还没覆盖</button>
    </view>
  </view>
</template>
