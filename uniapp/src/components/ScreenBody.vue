<script>
export default {
  options: {
    virtualHost: true,
    styleIsolation: 'apply-shared',
  },
}
</script>

<script setup>
/**
 * ScreenBody — 顶栏下方可滚动内容区
 * tab: 为 FloatNav 预留底部空间（用真实占位节点，避免 scroll-view padding 无效）
 */
defineProps({
  tab: { type: Boolean, default: false },
})
</script>

<template>
  <scroll-view
    scroll-y
    class="screen-body"
    style="flex:1;height:0;min-height:0;width:100%;box-sizing:border-box;"
    enhanced
    :show-scrollbar="true"
  >
    <view class="screen-body-inner">
      <slot />
      <!-- 真实高度节点：滚到底时内容不会被 FloatNav 挡住 -->
      <view v-if="tab" class="screen-body-tab-spacer"></view>
    </view>
  </scroll-view>
</template>

<style>
.screen-body-tab-spacer {
  height: 200rpx;
  width: 100%;
  flex-shrink: 0;
}
</style>
