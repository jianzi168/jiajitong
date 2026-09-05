<script setup>
import { ref } from 'vue'
import { useWizardStore } from '@/stores/wizard'
import { applyProfile } from '@/services/session'
import { calcFull, savePlan, bootstrap } from '@/services/api'

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
    const planOutput = await calcFull(wizard.payload)

    // 2. Phase 6: 自动 bootstrap + save (云函数自动用 ctx.openid)
    let activePlan = null
    try {
      const profile = await bootstrap({})
      applyProfile(profile)
      const saved = await savePlan({
        planInput: wizard.payload,
        planOutput,
      })
      activePlan = saved.plan
    } catch (e) {
      // 保存失败时报告页仍可展示；启用追踪时会再尝试 save
      console.warn('[loading] save failed, fallback to globalData:', e?.message || e, e?.userHint || '')
      uni.showToast({
        title: e?.userHint || '方案未存云端，稍后启用时可重试',
        icon: 'none',
        duration: 2500,
      })
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