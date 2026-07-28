<template>
  <view class="track-bar" :class="sizeClass">
    <view
      class="track-fill"
      :class="fillClass"
      :style="{ width: safePct + '%' }"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pct: { type: Number, default: 0 },
  color: { type: String, default: 'green' }, // 'green' | 'yellow' | 'red'
  size: { type: String, default: 'md' },      // 'sm' | 'md'
})

// 防御性 clamp: 避免 width 越界 (used > suggested 时, 后端应已 clamp, 这里做兜底)
const safePct = computed(() => Math.max(0, Math.min(100, props.pct || 0)))

const fillClass = computed(() => {
  if (props.color === 'red') return 'track-fill-danger'
  if (props.color === 'yellow') return 'track-fill-warn'
  return 'track-fill-ok'
})
const sizeClass = computed(() => (props.size === 'sm' ? 'track-bar-sm' : ''))
</script>