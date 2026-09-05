<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { toBase64 } from '@/utils/base64.js'
import { joinFamily } from '@/services/api'
import { hasLocalSession } from '@/services/session'

// 与 login.vue 约定: 未登录跳走时把邀请码暂存这里,
// 登录成功后 login 会读这个 storage 并 reLaunch 回本页 + 自动预填
const PENDING_JOIN_INVITE_CODE = 'pending_join_invite_code'

// 40101 = UNAUTHORIZED（与 cloudfunctions/api/common/response.js 一致）
const ERR_NEED_LOGIN = 40101

const inviteCode = ref('')
const fromShare = ref(false)    // 是否从分享链接进来（用于显示「已自动填入」）
const loading = ref(false)
const errorMsg = ref('')
const joined = ref(false)
const needLogin = ref(false)    // true 时显示「去登录」引导按钮

function readPendingCode() {
  try {
    return (uni.getStorageSync(PENDING_JOIN_INVITE_CODE) || '').toString().trim()
  } catch (e) {
    return ''
  }
}

function writePendingCode(code) {
  try {
    if (code) uni.setStorageSync(PENDING_JOIN_INVITE_CODE, code)
    else uni.removeStorageSync(PENDING_JOIN_INVITE_CODE)
  } catch (e) { /* storage 不可用也不阻塞主流程 */ }
}

function clearPendingCode() {
  try { uni.removeStorageSync(PENDING_JOIN_INVITE_CODE) } catch (e) {}
}

// onLoad: query.code 优先, 否则读 storage 兜底
onLoad((query = {}) => {
  const code = (query.code || readPendingCode() || '').trim().toUpperCase()
  if (code && code.length >= 6) {
    inviteCode.value = code
    fromShare.value = true
    // 已消费 storage 的值, 避免下次误用
    if (!query.code) clearPendingCode()
  }
  needLogin.value = !hasLocalSession()
})

// onShow: 登录态可能在别处已恢复, 重新检测
onShow(() => {
  needLogin.value = !hasLocalSession()
})

function onGoLogin() {
  // 把当前邀请码暂存, 登录成功后由 login.vue 带回
  const code = inviteCode.value.trim().toUpperCase()
  if (code) writePendingCode(code)
  uni.redirectTo({ url: '/pages/login/index' })
}

async function onJoin() {
  const code = inviteCode.value.trim().toUpperCase()
  if (!code || code.length < 6) {
    errorMsg.value = '请输入有效的邀请码'
    return
  }

  // 前置登录态检测: 未登录直接走 CTA 引导, 避免无意义往返
  if (!hasLocalSession()) {
    writePendingCode(code)
    needLogin.value = true
    errorMsg.value = '加入家庭需要先登录'
    return
  }

  loading.value = true
  errorMsg.value = ''
  needLogin.value = false
  try {
    // handler 期望 payload.invite_code, 不是 code
    const res = await joinFamily({ invite_code: code })
    joined.value = true
    // 成功后清掉 pending, 不然下次冷启动会被误填
    clearPendingCode()
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/home/index' })
    }, 1500)
  } catch (e) {
    // 40101: token 失效 / 中途掉登录, 引导重新登录
    if (e && e.code === ERR_NEED_LOGIN) {
      needLogin.value = true
      errorMsg.value = '加入家庭需要先登录'
      // 仍暂存邀请码, 让登录后能无缝回来
      writePendingCode(code)
    } else {
      errorMsg.value = e.userHint || e.message || '加入失败，请检查邀请码'
    }
    console.error('[partner-join] joinFamily failed:', e)
  } finally {
    loading.value = false
  }
}

const partnerGraphicSrc = 'data:image/svg+xml;base64,' + toBase64(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="112" height="112">' +
    '<circle cx="20" cy="22" r="8" fill="#FF8A7A" opacity="0.6"/>' +
    '<circle cx="36" cy="22" r="8" fill="#B8A4E8" opacity="0.6"/>' +
    '<path d="M12 44c0-6 4-10 8-10s8 4 8 10" stroke="#999" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M28 44c0-6 4-10 8-10s8 4 8 10" stroke="#999" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '</svg>'
)
</script>

<template>
  <view class="screen">
    <NavBar title="加入家庭" />

    <ScreenBody class="screen-body-center">
      <!-- 成功态 -->
      <template v-if="joined">
        <view class="success-icon">✅</view>
        <text class="screen-title">加入成功！</text>
        <text class="hint-text hint-text-center">正在跳转到家庭看板...</text>
      </template>

      <!-- 输入态 -->
      <template v-else>
        <image class="partner-graphic" :src="partnerGraphicSrc" mode="widthFix" />

        <text class="screen-title">输入邀请码</text>
        <text class="hint-text hint-text-center">{{ fromShare ? '已从分享链接自动带入，点击加入即可' : '让 TA 把邀请码发给你' }}</text>

        <view class="code-input-wrap">
          <input
            v-model="inviteCode"
            class="code-input"
            type="text"
            placeholder="输入 8 位邀请码"
            placeholder-class="code-placeholder"
            maxlength="8"
            :disabled="loading"
            @confirm="onJoin"
          />
        </view>

        <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>

        <!-- 未登录引导: 错误提示下方挂一个醒目的「去登录」按钮 -->
        <view v-if="needLogin" class="login-cta">
          <text class="login-cta-hint">继续操作需要先登录</text>
          <button class="grad-btn" @tap="onGoLogin">微信一键登录</button>
        </view>

        <!-- 已登录但加入失败: 仍保留加入按钮供重试 -->
        <button
          v-else
          class="grad-btn"
          :loading="loading"
          :disabled="loading"
          @tap="onJoin"
        >
          {{ loading ? '加入中...' : '加入家庭' }}
        </button>
      </template>
    </ScreenBody>
  </view>
</template>

<style>
.partner-graphic {
  display: block;
  width: 112rpx;
  height: 112rpx;
  margin: 0 auto 40rpx;
}

.code-input-wrap {
  width: 100%;
  max-width: 480rpx;
  margin: 32rpx auto;
}
.code-input {
  width: 100%;
  height: 96rpx;
  background: var(--color-surface);
  border-radius: 24rpx;
  text-align: center;
  font-size: 40rpx;
  font-weight: 800;
  color: var(--color-coral);
  letter-spacing: 12rpx;
  font-family: 'Courier New', monospace;
  box-shadow: 0 4rpx 16rpx rgba(28, 25, 23, 0.04);
}
.code-placeholder {
  font-size: 28rpx;
  font-weight: 400;
  letter-spacing: 2rpx;
  color: var(--color-text-3);
}

.error-text {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-coral);
  margin-bottom: 16rpx;
}

/* 未登录 CTA */
.login-cta {
  width: 100%;
  max-width: 480rpx;
  margin: 0 auto;
  text-align: center;
}
.login-cta-hint {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
  margin-bottom: 16rpx;
}

.success-icon {
  font-size: 96rpx;
  text-align: center;
  margin-bottom: 24rpx;
}
</style>
