<script setup>
import { computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

onMounted(() => {
  // 默认储蓄目标 = 收入 20%（若未填）
  if (!wizard.savingsTarget && wizard.monthlyIncome > 0) {
    wizard.setSavingsTarget(Math.round(wizard.monthlyIncome * 0.2))
  }
})

const savingsPercent = computed(() => {
  if (!wizard.monthlyIncome) return 0
  return Math.round((wizard.savingsTarget / wizard.monthlyIncome) * 100)
})

const monthsToBaby = computed({
  get: () => wizard.monthsToBaby,
  set: (v) => wizard.setBaby({ monthsToBaby: v }),
})

function format(n) {
  return Number(n || 0).toLocaleString('en-US')
}
function onInput(key, e) {
  const v = String(e.detail.value).replace(/[^\d]/g, '')
  if (key === 'savings') wizard.setSavingsTarget(v)
  else if (key === 'emergency') wizard.setEmergencyFund(v)
  else if (key === 'monthsToBaby') wizard.setBaby({ monthsToBaby: v || null })
  else if (key === 'currentBabyReserve') wizard.setBaby({ currentBabyReserve: v })
}
function onSavingsSlider(e) {
  wizard.setSavingsTarget(e.detail.value)
}
function onBabySlider(e) {
  monthsToBaby.value = Number(e.detail.value) || null
}
function onNext() {
  if (!wizard.savingsTarget) {
    uni.showToast({ title: '请填写储蓄目标', icon: 'none' })
    return
  }
  if (wizard.isBabyStage && (wizard.monthsToBaby == null || wizard.monthsToBaby <= 0)) {
    uni.showToast({ title: '请填写距生育月数', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/subpackages/wizard/step5' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" rightText="4/5" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body screen-body-scroll">
      <text class="field-heading">每月储蓄目标</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input
          type="number"
          :value="format(wizard.savingsTarget)"
          @input="onInput('savings', $event)"
        />
      </view>
      <text class="hint-text">建议占收入 {{ savingsPercent }}%（推荐 20%）</text>
      <slider
        class="slider-field"
        :value="wizard.savingsTarget"
        min="0"
        :max="Math.max(wizard.monthlyIncome * 0.4, 10000)"
        :step="500"
        activeColor="#FF6B8A"
        backgroundColor="rgba(28, 25, 23, 0.1)"
        block-color="#FF6B8A"
        block-size="20"
        @change="onSavingsSlider"
      />

      <text class="field-heading">当前应急金（已经存下的）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input
          type="number"
          :value="format(wizard.emergencyFund)"
          @input="onInput('emergency', $event)"
        />
      </view>
      <text class="hint-text">约覆盖 {{ wizard.emergencyFundMonths }} 个月固定支出</text>

      <template v-if="wizard.isBabyStage">
        <view class="section-divider">备育专项</view>

        <text class="field-heading">距计划生育还有（月）</text>
        <view class="field-block money-field">
          <input
            type="number"
            :value="monthsToBaby || ''"
            placeholder="例如 12"
            @input="onInput('monthsToBaby', $event)"
          />
          <text>个月</text>
        </view>
        <slider
          class="slider-field"
          :value="monthsToBaby || 12"
          min="1"
          max="36"
          :step="1"
          activeColor="#FF6B8A"
          backgroundColor="rgba(28, 25, 23, 0.1)"
          block-color="#FF6B8A"
          block-size="20"
          @change="onBabySlider"
        />

        <text class="field-heading">当前备育储备金</text>
        <view class="field-block money-field">
          <text>¥</text>
          <input
            type="number"
            :value="format(wizard.currentBabyReserve)"
            @input="onInput('currentBabyReserve', $event)"
          />
        </view>
      </template>

      <button class="grad-btn" @tap="onNext">下一步</button>
    </view>
  </view>
</template>

<style>
.section-divider {
  margin: 40rpx 0 24rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.section-divider::before, .section-divider::after {
  content: '';
  flex: 1;
  height: 1rpx;
  background: rgba(0,0,0,0.08);
}
</style>