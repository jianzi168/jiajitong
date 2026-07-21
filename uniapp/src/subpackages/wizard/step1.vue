<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const stages = [
  { id: 'newlywed', icon: '💑', title: '新婚磨合期', desc: '暂时没打算要娃，专注二人世界' },
  { id: 'planning', icon: '🤰', title: '计划未来生育', desc: '1–3 年内有生育计划，开始储备' },
  { id: 'pregnant', icon: '👶', title: '正在备孕中', desc: '已经积极备孕，需要更紧的预算' },
]

const selected = computed(() => wizard.stage)
const planYear = ref(1) // 1/2/3 年后
const showPlanPicker = ref(false)

function pick(s) {
  wizard.setStage(s.id)
  if (s.id === 'planning') {
    showPlanPicker.value = true
  } else {
    showPlanPicker.value = false
  }
}

function setPlanYear(y) {
  planYear.value = y
  wizard.setPlanDate(`${2026 + y}-01`)
  showPlanPicker.value = false
}

function onNext() {
  if (!wizard.stage) {
    uni.showToast({ title: '请先选择一个阶段', icon: 'none' })
    return
  }
  uni.redirectTo({ url: '/subpackages/wizard/step2' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" rightText="1/5" />

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg"></view>
      <view class="seg"></view>
      <view class="seg"></view>
      <view class="seg"></view>
    </view>

    <view class="screen-body">
      <text class="screen-title">你们现在处于哪个阶段？</text>

      <view
        v-for="s in stages"
        :key="s.id"
        class="pick-card"
        :class="{ selected: selected === s.id }"
        @tap="pick(s)"
      >
        <view class="pick-icon"><text class="pick-emoji">{{ s.icon }}</text></view>
        <view class="pick-body">
          <text class="pick-title">{{ s.title }}</text>
          <text class="pick-desc">{{ s.desc }}</text>
        </view>
      </view>

      <view v-if="showPlanPicker" class="year-picker">
        <text class="year-label">大概几年后？</text>
        <view class="year-row">
          <view
            v-for="y in [1, 2, 3]"
            :key="y"
            class="year-chip"
            :class="{ active: planYear === y }"
            @tap="setPlanYear(y)"
          >{{ y }} 年后</view>
        </view>
      </view>

      <button class="grad-btn" :disabled="!selected" @tap="onNext">下一步</button>
    </view>
  </view>
</template>

<style>
.pick-emoji { font-size: 44rpx; }
.year-picker {
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 16rpx;
}
.year-label { display: block; font-size: 28rpx; color: var(--color-text-2); margin-bottom: 16rpx; }
.year-row { display: flex; gap: 16rpx; }
.year-chip {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  border-radius: 12rpx;
  background: rgba(0, 0, 0, 0.04);
  font-size: 28rpx;
}
.year-chip.active {
  background: rgba(255, 107, 138, 0.15);
  color: #FF6B8A;
  font-weight: 600;
}
</style>