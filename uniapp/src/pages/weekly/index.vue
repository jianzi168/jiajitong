<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'

const weekBadge = '第 24 周 · 6/9 — 6/15'

const categories = ref([
  { name: '餐饮', amount: '680' },
  { name: '日用百货', amount: '120' },
  { name: '娱乐休闲', amount: '350' },
  { name: '医疗健康', amount: '0' },
  { name: '服饰美容', amount: '200' },
  { name: '交通通讯', amount: '85' },
  { name: '其他', amount: '0' }
])

const total = computed(() => {
  const sum = categories.value.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  return sum.toLocaleString('zh-CN')
})

function onCopyLast() {
  uni.showToast({ title: '已复制上周数据', icon: 'none' })
}

function onSubmit() {
  uni.reLaunch({ url: '/pages/dashboard/index' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="本周支出" />

    <view class="screen-body screen-body-scroll">
      <text class="week-badge">{{ weekBadge }}</text>
      <text class="text-link copy-link" @tap="onCopyLast">复制上周数据</text>

      <view class="weekly-grid">
        <view
          v-for="c in categories"
          :key="c.name"
          class="weekly-row"
        >
          <text>{{ c.name }}</text>
          <input
            class="field-input"
            type="text"
            v-model="c.amount"
          />
        </view>
      </view>

      <view class="week-total">
        本周合计 <text class="wt-val">¥{{ total }}</text>
      </view>

      <button class="grad-btn" @tap="onSubmit">提交</button>
    </view>
  </view>
</template>

<style>
.copy-link {
  display: inline-block;
  margin-bottom: 24rpx;
}
</style>
