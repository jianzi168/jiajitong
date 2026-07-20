<script setup>
import { computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const disposable = computed(() => {
  return Math.max(0, wizard.monthlyIncome - wizard.fixedTotal - wizard.savingsTarget)
})

function format(n) {
  return '¥' + Number(n || 0).toLocaleString('en-US')
}

const stageLabel = computed(() => ({
  newlywed: '新婚磨合期',
  planning: '计划未来生育',
  pregnant: '正在备孕中',
}[wizard.stage] || '未选择'))

const fixedItems = computed(() =>
  Object.entries(wizard.fixedExpenses)
    .filter(([k, v]) => v > 0)
    .map(([k, v]) => {
      const labels = { housing: '房贷/房租', loan: '车贷/停车', insurance: '保险', support: '赡养', other: '其他固定' }
      return { key: k, label: labels[k] || k, value: v }
    })
)

function onGenerate() {
  if (!wizard.canSubmit) {
    uni.showToast({ title: '请补全必填项', icon: 'none' })
    return
  }
  uni.redirectTo({ url: '/subpackages/wizard/loading' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="确认信息">
      <template #right>
        <text class="step-label">5/5</text>
      </template>
    </NavBar>

    <view class="wizard-track">
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
      <view class="seg done"></view>
    </view>

    <view class="screen-body screen-body-scroll">
      <view class="glass-card kv-list">
        <view class="kv-row"><text>家庭阶段</text><text class="kv-val">{{ stageLabel }}</text></view>
        <view class="kv-row"><text>所在城市</text><text class="kv-val">{{ wizard.city || '—' }}</text></view>
        <view class="kv-row"><text>月收入</text><text class="kv-val">{{ format(wizard.monthlyIncome) }}</text></view>
        <view class="kv-row"><text>固定支出</text><text class="kv-val">{{ format(wizard.fixedTotal) }}</text></view>
        <view class="kv-row"><text>储蓄目标</text><text class="kv-val">{{ format(wizard.savingsTarget) }}</text></view>
        <view class="kv-row kv-row-highlight"><text>可支配</text><text class="kv-val">{{ format(disposable) }}</text></view>
      </view>

      <view v-if="fixedItems.length" class="glass-card kv-list">
        <text class="kv-section-title">固定开销明细</text>
        <view v-for="it in fixedItems" :key="it.key" class="kv-row kv-row-mini">
          <text>{{ it.label }}</text>
          <text class="kv-val">{{ format(it.value) }}</text>
        </view>
      </view>

      <view v-if="wizard.isBabyStage" class="glass-card kv-list">
        <text class="kv-section-title">备育专项</text>
        <view class="kv-row kv-row-mini"><text>距生育</text><text class="kv-val">{{ wizard.monthsToBaby || '—' }} 个月</text></view>
        <view class="kv-row kv-row-mini"><text>已储备</text><text class="kv-val">{{ format(wizard.currentBabyReserve) }}</text></view>
      </view>

      <text class="hint-text hint-text-center">免费版每月可测 1 次，付费可无限</text>

      <button class="grad-btn" :disabled="!wizard.canSubmit" @tap="onGenerate">
        生成我们的家庭规划书
      </button>
    </view>
  </view>
</template>

<style>
.kv-section-title {
  display: block;
  font-size: 26rpx;
  color: var(--color-text-2);
  margin-bottom: 12rpx;
}
.kv-row-mini {
  padding: 14rpx 0;
  font-size: 26rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.kv-row-mini > text:first-child {
  flex-shrink: 0;
}
.kv-row-mini > .kv-val {
  flex: 1;
  text-align: right;
  min-width: 0;
}
.hint-text-center { text-align: center; margin: 24rpx 0; }
</style>