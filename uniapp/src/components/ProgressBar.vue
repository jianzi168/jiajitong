<template>
  <view class="track-bar" :class="sizeClass">
    <view
      class="track-fill"
      :class="fillClass"
      :style="{ width: pct + '%' }"
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

const fillClass = computed(() => {
  if (props.color === 'red') return 'track-fill-danger'
  if (props.color === 'yellow') return 'track-fill-warn'
  return 'track-fill-ok'
})
const sizeClass = computed(() => (props.size === 'sm' ? 'track-bar-sm' : ''))
</script>