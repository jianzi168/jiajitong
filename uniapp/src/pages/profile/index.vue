<script setup>
import FloatNav from '@/components/FloatNav.vue'

const menus = [
  { label: '家庭档案', url: '/pages/family/index' },
  { label: '伴侣管理', url: '/pages/partner/index' },
  { label: '订阅管理', url: '/pages/paywall/index' },
  { label: '历史规划书', url: '/subpackages/report/full' },
  { label: '数据导出与隐私', url: '/pages/privacy/index' },
  { label: '帮助与反馈', url: '' }
]

function onMenu(item) {
  if (item.url) uni.navigateTo({ url: item.url })
}
</script>

<template>
  <view class="screen">
    <view class="profile-banner mesh-bg">
      <view class="avatar-circle">晓</view>
      <view>
        <text class="profile-name">晓雯的家庭</text>
        <text class="profile-sub">上海 · 备孕中 · Pro 至 2027/06</text>
      </view>
    </view>

    <view class="screen-body screen-body-scroll screen-body-tab">
      <view class="menu-stack">
        <button class="menu-item" v-for="(m, i) in menus" :key="i" @tap="onMenu(m)">
          <text>{{ m.label }}</text>
          <text>›</text>
        </button>
      </view>
    </view>

    <FloatNav active="profile" />
  </view>
</template>

<style>
.profile-banner { padding-top: 88rpx; }
.profile-name { display: block; }
</style>
