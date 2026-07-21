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
  setTimeout(advance, 300) // 视觉动画

  try {
    // 1. 调 calc.full 算方案
    const planOutput = await engineClient.callCalcFull(wizard.payload)

    // 2. Phase 6: 自动 bootstrap + save (云函数自动用 ctx.openid)
    let activePlan = null
    try {
      const profile = await engineClient.callWxLogin({})
      uni.setStorageSync('openid', profile.user?._openid || '')
      uni.setStorageSync('family_id', profile.family_id || '')
      const saved = await engineClient.callPlanSave({
        planInput: wizard.payload,
        planOutput,
      })
      activePlan = saved.plan
    } catch (e) {
      console.warn('[loading] save failed, fallback to globalData:', e)
      // 失败不影响主流程, 仅展示
    }

    // 3. 持久化到 globalData 给 preview 读
    const dataForPreview = activePlan || { ...planOutput, is_active: true }
    getApp().globalData.fullPlanResult = dataForPreview

    setTimeout(() => {
      uni.redirectTo({ url: '/subpackages/report/preview' })
    }, 1800)
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