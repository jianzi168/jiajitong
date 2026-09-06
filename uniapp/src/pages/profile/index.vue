<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import FloatNav from '@/components/FloatNav.vue'
import { getCapsuleSafeArea } from '@/utils/capsule'

const { statusBarHeight, navBarHeight, capsuleReserveRight } = getCapsuleSafeArea()
// 头像行：上下 padding + 头像高度约 112rpx
const bannerBodyHeight = typeof uni.upx2px === 'function' ? uni.upx2px(28 + 112 + 40) : 90
const headerPlaceholder = statusBarHeight + navBarHeight + bannerBodyHeight

// 副标题显示家庭名，与首页保持同一来源（商业化已移除，不再展示会员/权益状态）
const subscriptionLabel = uni.getStorageSync('nickname') || '我的家庭'

const menus = [
  { label: '家庭档案', url: '/pages/family/index' },
  { label: '伴侣管理', url: '/pages/partner/index' },
  // 原指向报告完整页，但那个页面只显示当前方案，与菜单名不符。
  // 改指向版本列表，点进去才是真正的历史版本。
  { label: '历史规划书', url: '/pages/plan/history' },
  { label: '数据导出与隐私', url: '/pages/privacy/index' },
  { label: '帮助与反馈', url: '/pages/help/index' }
]

function onMenu(item) {
  if (item.url) uni.navigateTo({ url: item.url })
}
</script>

<template>
  <view class="screen">
    <view class="profile-header mesh-bg">
      <view :style="{ height: statusBarHeight + 'px' }"></view>
      <view
        class="profile-header-nav"
        :style="{ height: navBarHeight + 'px', paddingRight: capsuleReserveRight + 'px' }"
      >
        <text class="page-title">我的</text>
      </view>
      <view
        class="profile-banner"
        :style="{ paddingRight: capsuleReserveRight + 'px' }"
      >
        <view class="avatar-circle">家</view>
        <view class="profile-meta">
          <text class="profile-name">家计通</text>
          <text class="profile-sub">{{ subscriptionLabel }}</text>
        </view>
      </view>
    </view>
    <view class="simple-header-placeholder" :style="{ height: headerPlaceholder + 'px' }"></view>

    <ScreenBody tab class="screen-body-scroll">
      <view class="menu-stack">
        <button class="menu-item" v-for="(m, i) in menus" :key="i" @tap="onMenu(m)">
          <text>{{ m.label }}</text>
          <text>›</text>
        </button>
      </view>
    </ScreenBody>

    <FloatNav active="profile" />
  </view>
</template>

<style scoped>
.profile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  /* mesh-bg 全局有 min-height:100%，固定顶栏必须取消，否则会盖住下方菜单 */
  min-height: 0;
}
.profile-header-nav {
  display: flex;
  align-items: center;
  padding-left: 40rpx;
  box-sizing: border-box;
}
.profile-banner {
  display: flex;
  gap: 28rpx;
  align-items: center;
  padding: 28rpx 40rpx 40rpx;
  box-sizing: border-box;
}
.profile-meta {
  min-width: 0;
  flex: 1;
}
.profile-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-sub {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
