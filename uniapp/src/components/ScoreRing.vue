<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { toBase64 } from '@/utils/base64.js'

const props = defineProps({
  score: { type: Number, default: 0 },
  size: { type: String, default: 'lg' } // lg=140 / sm=100 (原型 px)
  // animate: true(默认) 时进入页面数字从 0 递增到 score（原型 app.js 行为）
})

// viewBox 120x120, r=52, 周长 ≈ 326.7
const CIRC = 326

// 用于动画的可变分数
const displayScore = ref(0)
let timer = null

function startAnimate(target) {
  if (timer) { clearInterval(timer); timer = null }
  const safe = Math.max(0, Math.min(100, target))
  if (safe === 0) { displayScore.value = 0; return }
  // 原型: 步进 = ceil(target / 24)，每 30ms 一次
  const step = Math.max(1, Math.ceil(safe / 24))
  displayScore.value = 0
  timer = setInterval(() => {
    const next = displayScore.value + step
    if (next >= safe) {
      displayScore.value = safe
      clearInterval(timer)
      timer = null
    } else {
      displayScore.value = next
    }
  }, 30)
}

// 初始化 + 监听 score 变化（页面切换时组件复用，score 变化会重启动画）
startAnimate(props.score)
watch(() => props.score, (v) => startAnimate(v))
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// 环偏移（基于 displayScore 实现环与数字同步动画）
const dashoffset = computed(() => CIRC * (1 - displayScore.value / 100))

// 评分环 data-uri SVG
const ringSrc = computed(() => {
  const offset = (CIRC * (1 - displayScore.value / 100)).toFixed(2)
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
      '<g transform="rotate(-90 60 60)">' +
        '<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(28,25,23,0.08)" stroke-width="6"/>' +
        `<circle cx="60" cy="60" r="52" fill="none" stroke="#FF6B8A" stroke-width="6" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${offset}"/>` +
      '</g>' +
    '</svg>'
  return 'data:image/svg+xml;base64,' + toBase64(svg)
})
</script>

<template>
  <view class="score-display" :class="{ 'score-display-sm': size === 'sm' }">
    <image class="ring-img" :src="ringSrc" mode="widthFix" />
    <view class="score-num grad-text">{{ displayScore }}</view>
  </view>
</template>

<style>
.score-display {
  position: relative;
  width: 280rpx;
  height: 280rpx;
  margin: 0 auto 16rpx;
}
.score-display-sm { width: 200rpx; height: 200rpx; }

.ring-img { width: 100%; height: 100%; }

.score-num {
  position: absolute;
  left: 0; top: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 96rpx; font-weight: 700;
  line-height: 1;
}
.score-display-sm .score-num { font-size: 72rpx; }
</style>
