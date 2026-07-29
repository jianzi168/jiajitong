<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import FloatNav from '@/components/FloatNav.vue'
import { useSubscriptionStore } from '@/stores/subscription'

const subStore = useSubscriptionStore()

onShow(async () => {
  try { await subStore.refresh() } catch (e) {}
})

function fmtDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const subscriptionLabel = computed(() => {
  if (subStore.isPro) {
    return `Pro 至 ${fmtDate(subStore.subscription?.expires_at)}`
  }
  if (subStore.isReportOnce) {
    return `单次报告 至 ${fmtDate(subStore.subscription?.expires_at)}`
  }
  return '免费版'
})

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
      <view class="avatar-circle">家</view>
      <view>
        <text class="profile-name">家计通</text>
        <text class="profile-sub">{{ subscriptionLabel }}</text>
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

<style scoped>
.profile-banner { padding-top: 88rpx; }
.profile-name { display: block; }
</style>
