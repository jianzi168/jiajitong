<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import NavBar from '@/components/NavBar.vue'
import { PRIVACY_POLICY_META, PRIVACY_POLICY_SECTIONS } from './policyContent.js'

const meta = PRIVACY_POLICY_META
const sections = PRIVACY_POLICY_SECTIONS
</script>

<template>
  <view class="screen">
    <NavBar title="隐私政策" />

    <ScreenBody class="screen-body-scroll policy-body">
      <text class="policy-title">{{ meta.title }}</text>
      <text class="policy-meta">更新日期：{{ meta.updatedAt }}</text>
      <text class="policy-meta">运营主体：{{ meta.operator }}</text>

      <view
        v-for="(sec, i) in sections"
        :key="i"
        class="policy-section"
      >
        <text class="policy-heading">{{ sec.heading }}</text>
        <text
          v-for="(p, j) in sec.paragraphs"
          :key="j"
          class="policy-p"
        >{{ p }}</text>
      </view>
    </ScreenBody>
  </view>
</template>

<style scoped>
.policy-body :deep(.screen-body-inner) {
  padding-bottom: 80rpx;
}
.policy-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16rpx;
  letter-spacing: -0.02em;
}
.policy-meta {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-3);
  line-height: 1.5;
  margin-bottom: 4rpx;
}
.policy-section {
  margin-top: 40rpx;
}
.policy-heading {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16rpx;
}
.policy-p {
  display: block;
  font-size: 28rpx;
  color: var(--color-text-2);
  line-height: 1.7;
  margin-bottom: 16rpx;
}
</style>
