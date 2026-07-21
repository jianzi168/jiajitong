<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import engineClient from '@/utils/engineClient'

const loading = ref(false)
const errorMsg = ref('')

// Phase 6: 真实调云函数 user.bootstrap
async function onWechatLogin() {
  if (loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const userInfo = await getUserProfile()
    const profile = await engineClient.callWxLogin({
      nickname: userInfo.nickName,
      avatar: userInfo.avatarUrl,
    })
    // 缓存 openid + family_id
    uni.setStorageSync('openid', profile.user?._openid || '')
    uni.setStorageSync('family_id', profile.family_id || '')
    uni.setStorageSync('nickname', profile.user?.nickname || '')

    // 跳到 preview 或 home (已有 activePlan 就 preview, 否则 home)
    if (profile.activePlan) {
      getApp().globalData.fullPlanResult = profile.activePlan
      uni.reLaunch({ url: '/subpackages/report/preview' })
    } else {
      uni.reLaunch({ url: '/pages/home/index' })
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
</script>

<template>
  <view class="screen">
    <NavBar title="登录" />

    <view class="screen-body screen-body-center login-panel">
      <text class="brand-mark">家计通</text>
      <text class="brand-sub">家庭财务教练 · 数据加密存储</text>

      <button class="grad-btn grad-btn-lg" :disabled="loading" @tap="onWechatLogin">
        <text>{{ loading ? '登录中…' : '微信一键登录' }}</text>
      </button>

      <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>

      <text class="hint-text hint-text-center">登录即表示同意《用户协议》与《隐私政策》</text>
      <text class="hint-text">快测填过的信息会自动带进向导</text>
    </view>
  </view>
</template>

<style>
.grad-btn-lg { padding: 28rpx 0; font-size: 32rpx; }
.error-text { display: block; margin-top: 24rpx; color: #c33; font-size: 26rpx; }
</style>