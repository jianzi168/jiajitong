<script setup>
import { ref } from 'vue'

const stepTexts = ['匹配城市数据', '推算预算区间', '生成专属建议']
const currentStep = ref(0)

function cycleStep() {
  currentStep.value++
  if (currentStep.value >= stepTexts.length) {
    setTimeout(() => uni.redirectTo({ url: '/subpackages/report/preview' }), 500)
    return
  }
  setTimeout(cycleStep, 700)
}

setTimeout(cycleStep, 300)
</script>

<template>
  <view class="screen">
    <view class="loading-screen mesh-bg">
      <view class="loading-spinner"></view>
      <text class="loading-text">{{ stepTexts[currentStep] }}</text>
      <view class="loading-steps">
        <text
          v-for="(s, i) in stepTexts"
          :key="s"
          class="loading-step"
          :class="{ active: i === currentStep }"
        >{{ s }}</text>
      </view>
    </view>
  </view>
</template>
