<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'

const hideRatios = ref(false)

function onSave() {
  uni.showToast({ title: '保存图片待接入', icon: 'none' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="分享预览" />

    <view class="screen-body screen-body-center">
      <!-- share-card 自带 mesh 渐变（已在 common.scss 的 .share-card 配 grad-hero） -->
      <view class="share-card mesh-bg">
        <text class="share-brand">家计通</text>
        <text class="share-score grad-text">82</text>
        <text class="share-label">家庭财务健康分</text>
        <text class="share-meta">上海 · 备育家庭</text>
        <text class="share-desc">财务处于稳健区间</text>
        <view v-if="!hideRatios" class="share-stats">
          <text>储蓄率 20%</text>
          <text>固定占比 45%</text>
        </view>
        <view class="share-qr">QR</view>
        <text class="share-foot">扫码测测你们家预算</text>
      </view>

      <view class="check-row">
        <switch :checked="hideRatios" @change="(e) => hideRatios = e.detail.value" color="#FF6B8A" />
        <text>只分享分数，隐藏比例</text>
      </view>

      <button class="grad-btn" @tap="onSave">保存图片</button>
    </view>
  </view>
</template>

<style>
.share-card .grad-text {
  /* 白色渐变在 mesh 背景上保持对比 */
  background: linear-gradient(135deg, #fff, #FFE4DA);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
</style>