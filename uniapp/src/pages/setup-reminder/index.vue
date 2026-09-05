<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
import { onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { isSubscribeConfigured, UNAVAILABLE_COPY } from '@/utils/featureAvailability.js'
import { recordSubscribe, getSubscribeStatus } from '@/services/api'
import { track, trackPage } from '@/utils/analytics'

// Phase 10: 订阅消息推送（需在小程序后台申请订阅消息模板后填入真实 ID）
// 未填入时按钮提示"暂未开放"，不影响其他功能。
const WEEKLY_TMPL_ID = ''
const tmplIds = WEEKLY_TMPL_ID ? [WEEKLY_TMPL_ID] : []

const subStatus = ref(null) // { configured, records: [{template_id, quota, total}] }
const syncing = ref(false)

onMounted(async () => {
  trackPage('setup_reminder')
  try {
    const res = await getSubscribeStatus()
    subStatus.value = res
  } catch (e) {
    // 云函数不可用时忽略
  }
})

// 已授权总次数（多模板累计）
const totalAccepted = () => {
  const rs = (subStatus.value && subStatus.value.records) || []
  return rs.reduce((s, r) => s + (r.total || 0), 0)
}

async function onSubscribe() {
  if (!isSubscribeConfigured(tmplIds)) {
    uni.showToast({ title: UNAVAILABLE_COPY.subscribe, icon: 'none' })
    return
  }
  // #ifdef MP-WEIXIN
  if (typeof uni === 'undefined' || !uni.requestSubscribeMessage) {
    uni.showToast({ title: '当前环境不支持订阅消息', icon: 'none' })
    return
  }
  uni.requestSubscribeMessage({
    tmplIds,
    success: async (res) => {
      const accepted = Object.values(res || {}).filter((v) => v === 'accept').length
      if (accepted === 0) {
        uni.showToast({ title: '未授权订阅', icon: 'none' })
        return
      }
      // 上报授权记录（每授权一次获得一次推送配额）
      syncing.value = true
      try {
        for (const id of tmplIds) {
          if (res[id] === 'accept') await recordSubscribe({ template_id: id })
        }
        track('subscribe_accept', { count: accepted })
        const st = await getSubscribeStatus()
        subStatus.value = st
        uni.showToast({ title: '已开启提醒', icon: 'success' })
        setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 600)
      } catch (e) {
        uni.showToast({ title: e.userHint || e.message || '上报失败', icon: 'none' })
      } finally {
        syncing.value = false
      }
    },
    fail: (e) => {
      uni.showToast({ title: (e && e.errMsg) || '订阅失败', icon: 'none' })
    },
  })
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '仅微信小程序支持订阅', icon: 'none' })
  // #endif
}

function onLater() {
  uni.reLaunch({ url: '/pages/dashboard/index' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="周度提醒" />

    <ScreenBody class="screen-body-center">
      <view class="empty-graphic">
        <text style="font-size:56rpx;">⏰</text>
      </view>
      <text class="screen-title">每周日提醒你填一下</text>
      <text class="hint-text hint-text-center">30 秒更新 7 大类支出</text>
      <text class="hint-text hint-text-center">不打扰、不推销</text>

      <view v-if="totalAccepted() > 0" class="sub-status">
        已开启提醒 · 累计授权 {{ totalAccepted() }} 次
      </view>

      <button class="grad-btn" :loading="syncing" :disabled="syncing" @tap="onSubscribe">开启订阅消息</button>
      <button class="grad-btn grad-btn-ghost" @tap="onLater">稍后再说</button>
    </ScreenBody>
  </view>
</template>

<style>
.sub-status {
  margin-bottom: 24rpx;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(76, 175, 80, 0.12);
  color: #2E7D32;
  font-size: 24rpx;
  text-align: center;
}
</style>
