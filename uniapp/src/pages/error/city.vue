<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'

const city = ref('临沂')

function onContinue() {
  uni.navigateTo({ url: '/pages/quick/step2' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="选择城市" />

    <view class="screen-body">
      <view class="field-block select-field">
        <text>{{ city }}</text>
        <text class="chev">▼</text>
      </view>

      <view class="alert-banner">
        <text>您的城市即将开放，暂按<text class="tip-strong">新一线标准</text>估算，结果会标注为「估算值」</text>
      </view>

      <button class="grad-btn" @tap="onContinue">继续测算</button>
    </view>
  </view>
</template>