<script setup>
import { ref } from 'vue'
import engineClient from '@/utils/engineClient.js'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const stepTexts = ['匹配城市数据', '推算预算区间', '生成专属建议']
const currentStep = ref(0)
const errorMsg = ref('')

function advance() {
  currentStep.value++
  if (currentStep.value < stepTexts.length) {
    setTimeout(advance, 600)
  }
}

async function start() {
  // 立即开始动画（视觉）
  setTimeout(advance, 300)

  // 并行调 calc.full
  try {
    const result = await engineClient.callCalcFull(wizard.payload)
    // 存结果到全局，供 preview 读
    getApp().globalData.fullPlanResult = result
    // 跳到 report preview
    setTimeout(() => {
      uni.redirectTo({ url: '/subpackages/report/preview' })
    }, 1800) // 给动画一点缓冲
  } catch (e) {
    errorMsg.value = e.userHint || e.message || '生成失败'
    setTimeout(() => {
      uni.redirectTo({ url: '/subpackages/wizard/step5' })
    }, 1500)
  }
}

start()
</script>

<template>
  <view class="screen">
    <view class="loading-screen mesh-bg">
      <view class="loading-spinner"></view>
      <text v-if="!errorMsg" class="loading-text">{{ stepTexts[currentStep] }}</text>
      <text v-else class="loading-text loading-error">{{ errorMsg }}</text>
      <view v-if="!errorMsg" class="loading-steps">
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

<style>
.loading-error { color: #c33; }
</style>