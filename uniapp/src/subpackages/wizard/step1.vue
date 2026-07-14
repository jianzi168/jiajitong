<script setup>
import NavBar from '@/components/NavBar.vue'
import { ref } from 'vue'

const stages = [
  { id: 'newly', icon: '💑', title: '新婚磨合期', desc: '暂时还没打算要娃' },
  { id: 'prepare', icon: '🤰', title: '备孕中', desc: '正在认真准备要宝宝' },
  { id: 'plan', icon: '📅', title: '计划未来生育', desc: '选好大概的年份就行' }
]
const selected = ref('prepare')

function next() {
  uni.navigateTo({ url: '/subpackages/wizard/step2' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭财务规划" />

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
        @tap="selected = s.id"
      >
        <view class="pick-icon">
          <text class="pick-emoji">{{ s.icon }}</text>
        </view>
        <view class="pick-body">
          <text class="pick-title">{{ s.title }}</text>
          <text class="pick-desc">{{ s.desc }}</text>
        </view>
      </view>

      <button class="grad-btn" @tap="next">下一步</button>
    </view>
  </view>
</template>

<style>
.pick-emoji { font-size: 44rpx; }
</style>
