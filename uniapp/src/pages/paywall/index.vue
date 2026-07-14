<script setup>
import NavBar from '@/components/NavBar.vue'

const cards = [
  {
    key: 'single',
    title: '单次完整报告',
    desc: '15–20 页 PDF + 7 天 Pro',
    badge: '首发 ¥9.9',
    featured: false,
    btn: '立即购买',
    btnClass: 'grad-btn-outline',
    go: 'report-full',
    checks: []
  },
  {
    key: 'pro',
    title: 'Pro 年付',
    desc: '',
    badge: '推荐',
    featured: true,
    btn: '开通 Pro',
    btnClass: '',
    go: 'report-full',
    checks: ['无限次测算', '全部建议 + PDF', '月度复盘']
  },
  {
    key: 'family',
    title: '家庭版 ¥128/年',
    desc: '伴侣协同 + 备育模板',
    badge: '',
    featured: false,
    btn: '了解家庭版',
    btnClass: 'grad-btn-outline',
    go: 'partner',
    checks: []
  }
]

function onPick(card) {
  uni.navigateTo({ url: '/subpackages/report/' + (card.go === 'partner' ? 'share' : 'full') })
}
</script>

<template>
  <view class="screen">
    <NavBar title="解锁完整规划" />

    <view class="screen-body screen-body-scroll">
      <view
        v-for="card in cards"
        :key="card.key"
        class="glass-card price-card"
        :class="{ 'price-card-featured': card.featured }"
      >
        <view v-if="card.badge" class="price-badge">{{ card.badge }}</view>
        <text class="text-strong">{{ card.title }}</text>
        <text v-if="card.desc && !card.featured" class="hint-text">{{ card.desc }}</text>

        <view v-if="card.featured" class="price-hero">¥68<text class="unit">/年</text></view>

        <view v-if="card.checks.length" class="check-list">
          <text v-for="(item, idx) in card.checks" :key="idx" class="li">{{ item }}</text>
        </view>

        <button class="grad-btn" :class="card.btnClass" @tap="onPick(card)">
          {{ card.btn }}
        </button>
      </view>
    </view>
  </view>
</template>

<style>
.price-card .hint-text { margin-top: 8rpx; margin-bottom: 24rpx; text-align: left; }
.price-card .text-strong { display: block; font-size: 32rpx; margin-bottom: 8rpx; }
</style>