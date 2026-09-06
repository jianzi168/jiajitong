<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { bootstrap } from '@/services/api'
import {
  hasLocalSession,
  restoreSession,
  applyProfile,
  resolveHomeRoute,
  clearLocalSession,
} from '@/services/session'

const loading = ref(false)
const errorMsg = ref('')

onShow(async () => {
  // 已登录再进登录页：直接回主站
  if (!hasLocalSession() || loading.value) return
  loading.value = true
  try {
    const { route } = await restoreSession()
    uni.reLaunch({ url: route })
  } catch (e) {
    clearLocalSession()
  } finally {
    loading.value = false
  }
})

async function onWechatLogin() {
  if (loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const userInfo = await getUserProfile()
    const profile = await bootstrap({
      nickname: userInfo.nickName,
      avatar: userInfo.avatarUrl,
    })
    applyProfile(profile)

    // 优先处理: 如果 join.vue 在我们跳走前暂存了邀请码, 登录成功后直接回到 join 页
    // 并把邀请码通过 query 传过去, join.vue onLoad 会读 query.code 并预填
    let pendingCode = ''
    try {
      pendingCode = (uni.getStorageSync('pending_join_invite_code') || '').toString().trim()
      if (pendingCode) uni.removeStorageSync('pending_join_invite_code')
    } catch (e) { /* ignore */ }

    if (pendingCode) {
      uni.reLaunch({
        url: `/pages/partner/join?code=${encodeURIComponent(pendingCode)}`,
      })
      return
    }

    // 主动登录：有方案先进预览；否则空态首页
    if (profile.activePlan) {
      uni.reLaunch({ url: '/subpackages/report/preview' })
    } else {
      uni.reLaunch({ url: resolveHomeRoute(profile) })
    }
  } catch (e) {
    errorMsg.value = e.userHint || e.message || '登录失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

function getUserProfile() {
  // 微信小程序 getUserProfile (Phase 6 dev: 允许失败也不影响登录)
  return new Promise((resolve) => {
    if (typeof uni === 'undefined' || !uni.getUserProfile) {
      return resolve({ nickName: '微信用户', avatarUrl: '' })
    }
    uni.getUserProfile({
      desc: '用于显示你的昵称和头像',
      success: (res) => resolve(res.userInfo || {}),
      fail: () => resolve({ nickName: '微信用户', avatarUrl: '' }),
    })
  })
}

function goPrivacyPolicy() {
  uni.navigateTo({ url: '/pages/privacy/policy' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="登录" />

    <ScreenBody class="screen-body-center login-panel">
      <text class="brand-mark">家计通</text>
      <text class="brand-sub">家庭财务教练 · 数据加密存储</text>

      <button class="grad-btn grad-btn-lg" :disabled="loading" @tap="onWechatLogin">
        <text>{{ loading ? '登录中…' : '微信一键登录' }}</text>
      </button>

      <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>

      <view class="legal-row">
        <text class="hint-text">登录即表示同意</text>
        <text class="legal-link">《用户协议》</text>
        <text class="hint-text">与</text>
        <text class="legal-link" @tap="goPrivacyPolicy">《隐私政策》</text>
      </view>
      <text class="hint-text hint-text-center">快测填过的信息会自动带进向导</text>
    </ScreenBody>
  </view>
</template>

<style>
.grad-btn-lg { padding: 28rpx 0; font-size: 32rpx; }
.error-text { display: block; margin-top: 24rpx; color: #c33; font-size: 26rpx; }
.legal-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  margin-top: 32rpx;
  gap: 0;
}
.legal-row .hint-text { margin: 0; }
.legal-link {
  color: var(--color-coral);
  font-size: 26rpx;
  font-weight: 600;
}
</style>
