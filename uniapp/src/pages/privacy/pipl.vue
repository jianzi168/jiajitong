<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import NavBar from '@/components/NavBar.vue'
import { PIPL_META, PIPL_RIGHTS_MAP, PIPL_CHAPTERS } from './piplContent.js'

const meta = PIPL_META
const rightsMap = PIPL_RIGHTS_MAP
const chapters = PIPL_CHAPTERS
</script>

<template>
  <view class="screen">
    <NavBar title="个人信息保护法" />

    <ScreenBody class="screen-body-scroll policy-body">
      <text class="policy-title">{{ meta.title }}</text>
      <text class="policy-meta">{{ meta.passed }}</text>
      <text class="policy-meta">{{ meta.effective }}</text>
      <text class="policy-meta">{{ meta.source }}</text>

      <!--
        权利与功能对应表：法律的第四章「个人权利」与本 App 的入口一一对应，
        让用户知道行使权利时点哪里，而不是只看到条文。
      -->
      <view class="rights-card">
        <text class="rights-title">你的权利，在这里行使</text>
        <view v-for="(r, i) in rightsMap" :key="i" class="rights-row">
          <view class="rights-head">
            <text class="rights-name">{{ r.title }}</text>
            <text class="rights-article">{{ r.article }}</text>
          </view>
          <text class="rights-desc">{{ r.desc }}</text>
          <text class="rights-feature">{{ r.feature }}</text>
        </view>
      </view>

      <!--
        章节结构：大多数章直接挂 articles；第二章有三节，
        用 sections 嵌套渲染，保持与正式文本一致的层级。
      -->
      <template v-for="(ch, ci) in chapters" :key="ci">
        <text class="policy-heading chapter">{{ ch.title }}</text>
        <template v-if="ch.articles">
          <view v-for="(a, ai) in ch.articles" :key="ai" class="policy-article">
            <text class="policy-no">{{ a.no }}</text>
            <text v-for="(p, pi) in a.paras" :key="pi" class="policy-p">{{ p }}</text>
          </view>
        </template>
        <template v-else-if="ch.sections">
          <view v-for="(sec, si) in ch.sections" :key="si" class="policy-section-block">
            <text class="section-title">{{ sec.title }}</text>
            <view v-for="(a, ai) in sec.articles" :key="ai" class="policy-article">
              <text class="policy-no">{{ a.no }}</text>
              <text v-for="(p, pi) in a.paras" :key="pi" class="policy-p">{{ p }}</text>
            </view>
          </view>
        </template>
      </template>
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

/* 权利对应卡 */
.rights-card {
  margin-top: 36rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, rgba(255, 107, 138, 0.1), rgba(168, 85, 247, 0.06));
  border: 1rpx solid rgba(255, 107, 138, 0.14);
}
.rights-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 20rpx;
}
.rights-row {
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--color-border);
}
.rights-row:last-child {
  border-bottom: none;
}
.rights-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}
.rights-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.rights-article {
  font-size: 22rpx;
  color: var(--color-coral);
}
.rights-desc {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
  line-height: 1.6;
}
.rights-feature {
  display: block;
  font-size: 22rpx;
  color: var(--color-text-3);
  margin-top: 6rpx;
}

/* 条文 */
.chapter {
  margin-top: 48rpx;
}
.policy-section-block {
  margin-top: 28rpx;
}
.section-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16rpx;
}
.policy-article {
  margin-bottom: 24rpx;
}
.policy-no {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8rpx;
}
.policy-p {
  display: block;
  font-size: 26rpx;
  color: var(--color-text-2);
  line-height: 1.7;
  margin-bottom: 8rpx;
}
</style>
