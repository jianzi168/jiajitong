<script setup>
import { ref, computed, onLoad } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { getCurrentWeekly, copyLastWeek, submitWeekly } from '@/services/api'

const CATEGORIES = [
  { id: 'food',          label: '餐饮' },
  { id: 'daily',         label: '日用' },
  { id: 'entertainment', label: '娱乐' },
  { id: 'medical',       label: '医疗' },
  { id: 'clothing',      label: '服饰' },
  { id: 'transport',     label: '交通通讯' },
  { id: 'other',         label: '其他' },
]

const cats = ref(CATEGORIES.map((c) => ({ ...c, amount: '' })))
const weekBadge = ref('')
const submitting = ref(false)

const total = computed(() => {
  const sum = cats.value.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  return sum.toLocaleString('zh-CN')
})

onLoad(async () => {
  try {
    const res = await getCurrentWeekly()
    weekBadge.value = `${res.weekStart} — ${res.weekEnd}`
    if (res.entry && res.entry.categories) {
      cats.value = cats.value.map((c) => ({
        ...c,
        amount: String(res.entry.categories[c.id] ?? ''),
      }))
    }
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
})

async function onCopyLast() {
  try {
    const res = await copyLastWeek()
    if (!res.categories) {
      uni.showToast({ title: '没有上周数据', icon: 'none' })
      return
    }
    cats.value = cats.value.map((c) => ({
      ...c,
      amount: String(res.categories[c.id] ?? ''),
    }))
    uni.showToast({ title: '已复制上周', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' })
  }
}

async function onSubmit() {
  const categories = {}
  for (const c of cats.value) {
    categories[c.id] = Math.max(0, Math.round(Number(c.amount) || 0))
  }
  submitting.value = true
  try {
    uni.showLoading({ title: '提交中...' })
    await submitWeekly({ categories })
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 500)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.message || '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="本周支出" />

    <view class="screen-body screen-body-scroll">
      <text class="week-badge">{{ weekBadge || '加载中...' }}</text>
      <text class="text-link copy-link" @tap="onCopyLast">复制上周数据</text>

      <view class="weekly-grid">
        <view
          v-for="c in cats"
          :key="c.id"
          class="weekly-row"
        >
          <text>{{ c.label }}</text>
          <input
            class="field-input"
            type="number"
            :data-id="c.id"
            v-model="c.amount"
          />
        </view>
      </view>

      <view class="week-total">
        本周合计 <text class="wt-val">¥{{ total }}</text>
      </view>

      <button class="grad-btn" :disabled="submitting" @tap="onSubmit">提交</button>
    </view>
  </view>
</template>

<style>
.copy-link {
  display: inline-block;
  margin-bottom: 24rpx;
}
</style>