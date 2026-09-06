<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { toBase64 } from '@/utils/base64.js'
import { createInvite, getFamilyMembers } from '@/services/api'
import { track, trackPage } from '@/utils/analytics'
import { onShareAppMessage } from '@dcloudio/uni-app'
import { countdownTextDetail, createNowTicker } from '@/utils/datetime'
import { resolveInviteAreaState } from '@/utils/partnerInvite'

// 邀请码状态
const inviteCode = ref('')
const inviteExpires = ref(null) // 过期时间戳
const loading = ref(false)
const errorMsg = ref('')

// 成员列表
const owner = ref({ nickname: '我', avatar: '', role: 'owner' })
const partner = ref(null) // { nickname, avatar, role, joined_at }

// 伴侣已加入 → 邀请区切换到禁用态
const ERR_FAMILY_ALREADY_PAIRED = 41008 // 与后端 response.js 一致
const hasPartner = computed(() => !!partner.value)
const areaState = computed(() => resolveInviteAreaState(hasPartner.value, inviteCode.value))

// 保留格式化的到期时间
function formatExpires(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${h}:${m} 前有效`
}

// 倒计时: now 由 createNowTicker 每 1s 推进, countdownStr 用 computed 派生,
// 模板直接绑定 {{ countdownStr }} (与 ScoreRing 直接绑定 ref 同款模式, 已在 mp-weixin 验证可用)
// 历史 BUG: 把 ref 塞进模板函数调用 countdownText(inviteExpires, now) 在 mp-weixin 下重渲染不可靠;
//           且原显示只有小时/分钟粒度, 一帧内看不出变化 → 误判"倒计时不动"
const now = ref(Date.now())
const countdownStr = computed(() =>
  inviteExpires.value ? countdownTextDetail(inviteExpires.value, now.value) : ''
)
const ticker = createNowTicker(now, 1_000) // 1s: 秒位每秒可见跳动

onMounted(() => {
  trackPage('partner')
  ticker.start()
  loadMembers()
})

// 兜底: 每次页面 onShow 时强制推一次 now, 确保从后台回来后倒计时立刻刷新
// (避免依赖 setInterval 在某些小程序基础库下的可靠性)
onShow(() => {
  now.value = Date.now()
  ticker.start()  // 幂等, 重复 start 不会创建多个 timer
})

onUnmounted(() => {
  ticker.stop()  // 防止内存泄漏 / 跨页面残留
})

async function loadMembers() {
  try {
    const res = await getFamilyMembers()
    if (res.owner) {
      owner.value = res.owner
    }
    if (res.members && res.members.length > 0) {
      partner.value = res.members[0]
    }
  } catch (e) {
    // 静默失败
  }
}

async function onInvite() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await createInvite()
    inviteCode.value = res.invite_code
    inviteExpires.value = res.expires_at
    track('invite_create')
  } catch (e) {
    if (e.code === ERR_FAMILY_ALREADY_PAIRED) {
      // 竞态: 加载后伴侣才加入 → 刷新成员, 自动切到已加入态
      await loadMembers()
      return
    }
    errorMsg.value = e.userHint || e.message || '创建邀请失败，请重试'
    console.error('[partner] createInvite failed:', e)
  } finally {
    loading.value = false
  }
}

function onCopyCode() {
  uni.setClipboardData({
    data: inviteCode.value,
    success: () => {
      uni.showToast({ title: '邀请码已复制', icon: 'success' })
    },
  })
}

function onRefresh() {
  inviteCode.value = ''
  inviteExpires.value = null
  errorMsg.value = ''
  loadMembers()
}

function onConfirm() {
  uni.navigateTo({ url: '/subpackages/report/full' })
}

// 进入协同看板（家庭共享预算看板）
function onDashboard() {
  uni.navigateTo({ url: '/pages/dashboard/index' })
}

// 头像占位首字
function avatarText(m) {
  const n = (m && m.nickname || '').trim()
  if (n) return n.slice(0, 1)
  return m && m.role === 'owner' ? '家' : '伴'
}


// ========== 微信分享（小程序分享到好友 / 朋友圈） ==========
// open-type="share" 按钮点击会触发此钩子，微信弹出好友选择面板
// 分享路径携带 inviteCode，对方打开 partner/join 时自动预填邀请码
onShareAppMessage((res) => {
  // 用户可能从「发送给朋友」或「分享到朋友圈」触发，都走这里
  const code = inviteCode.value
  if (!code) {
    // 兜底：万一没生成邀请码就点了分享，回到 join 页让 TA 自己输入
    return {
      title: '和我一起规划家庭预算吧',
      path: '/pages/partner/join',
    }
  }
  return {
    title: `加入我的家庭一起规划预算（邀请码 ${code}）`,
    path: `/pages/partner/join?code=${encodeURIComponent(code)}`,
    // imageUrl 可放一个分享卡片图（MVP 先省略）
  }
})



// 还原 prototype-v2 partner 顶部图标
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
    <NavBar title="邀请伴侣" />

    <ScreenBody class="screen-body-scroll">
      <image class="partner-graphic" :src="partnerGraphicSrc" mode="widthFix" />

      <text class="screen-title">邀请 TA 一起看</text>
      <text class="hint-text hint-text-center">共享规划书和预算看板（只读）</text>
      <text class="hint-text hint-text-center">一起确认小家的预算</text>

      <!-- ① 伴侣已加入: 禁用按钮 + 提示, 邀请卡自动收起 -->
      <view v-if="areaState === 'joined'" class="invite-cta">
        <button class="grad-btn grad-btn-disabled" disabled>生成邀请码</button>
        <text class="hint-text hint-text-center invite-full-hint">✓ 伴侣已加入，无需再生成邀请码</text>
      </view>

      <!-- ② 已生成邀请码 -->
      <view v-else-if="areaState === 'invite-card'" class="invite-card">
        <text class="invite-label">邀请码</text>
        <view class="invite-code-row">
          <text class="invite-code">{{ inviteCode }}</text>
          <view class="invite-copy-btn" @tap="onCopyCode">复制</view>
        </view>
        <text class="invite-expires" v-if="inviteExpires">
          ⏰ {{ formatExpires(inviteExpires) }}
          <text class="invite-countdown">（剩余 {{ countdownStr }}）</text>
        </text>
        <view class="invite-actions">
          <button class="grad-btn grad-btn-sm" open-type="share">发送给微信好友</button>
        </view>
      </view>

      <!-- ③ 未加入未生成: 可点击生成按钮 -->
      <view v-else>
        <button
          class="grad-btn"
          :loading="loading"
          :disabled="loading"
          @tap="onInvite"
        >
          {{ loading ? '生成中...' : '生成邀请码' }}
        </button>
        <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>
      </view>

      <!-- 成员列表 -->
      <view class="glass-card kv-list" style="margin-top: 40rpx;">
        <view class="kv-row">
          <view class="member-cell">
            <view class="member-avatar">
              <image v-if="owner.avatar" class="member-avatar-img" :src="owner.avatar" mode="aspectFill" />
              <text v-else class="member-avatar-text">{{ avatarText(owner) }}</text>
            </view>
            <text class="member-name">{{ owner.nickname || '我' }}</text>
          </view>
          <text class="kv-val-joined">管理员</text>
        </view>
        <view class="kv-row" v-if="partner">
          <view class="member-cell">
            <view class="member-avatar member-avatar-alt">
              <image v-if="partner.avatar" class="member-avatar-img" :src="partner.avatar" mode="aspectFill" />
              <text v-else class="member-avatar-text">{{ avatarText(partner) }}</text>
            </view>
            <text class="member-name">{{ partner.nickname || '伴侣' }}</text>
          </view>
          <text class="kv-val-joined">已加入</text>
        </view>
        <view class="kv-row" v-else>
          <view class="member-cell">
            <view class="member-avatar member-avatar-add">
              <text class="member-avatar-text">＋</text>
            </view>
            <text class="member-name text-muted">伴侣</text>
          </view>
          <text class="text-muted">待加入</text>
        </view>
      </view>

      <!-- 已邀请后刷新提示 -->
      <view v-if="inviteCode && !partner" class="refresh-hint" @tap="onRefresh">
        <text>伴侣加入后点击刷新 →</text>
      </view>

      <button class="grad-btn grad-btn-outline" @tap="onConfirm" style="margin-top: 24rpx;">共同确认预算</button>
      <button class="grad-btn" @tap="onDashboard" style="margin-top: 16rpx;">进入协同看板</button>
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

/* 邀请码卡片 */
.invite-card {
  background: linear-gradient(135deg, rgba(255, 107, 138, 0.08), rgba(168, 85, 247, 0.06));
  border: 2rpx solid rgba(255, 107, 138, 0.15);
  border-radius: 24rpx;
  padding: 32rpx;
  margin: 24rpx 0;
  text-align: center;
}
.invite-label {
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-bottom: 12rpx;
  display: block;
}
.invite-code-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  margin-bottom: 12rpx;
}
.invite-code {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--color-coral);
  letter-spacing: 8rpx;
  font-family: 'Courier New', monospace;
}
.invite-copy-btn {
  font-size: 24rpx;
  color: #fff;
  background: var(--color-coral);
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
}
.invite-expires {
  font-size: 24rpx;
  color: var(--color-text-2);
  display: block;
  margin-bottom: 20rpx;
}
.invite-countdown {
  color: var(--color-coral);
}
.invite-actions {
  display: flex;
  justify-content: center;
}
/* 伴侣已加入: 禁用按钮 + 提示 */
.grad-btn-disabled { opacity: 0.55; }
.invite-full-hint { color: var(--color-text-2); margin-top: 16rpx; }
.grad-btn-sm {
  width: auto;
  padding: 0 48rpx;
  height: 64rpx;
  line-height: 64rpx;
  font-size: 28rpx;
}

/* 已加入标签 */
.kv-val-joined {
  font-size: 28rpx;
  font-weight: 600;
  color: #22C55E;
}

/* 成员行（头像 + 昵称） */
.member-cell {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.member-avatar {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: var(--grad-hero);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.member-avatar-alt {
  background: linear-gradient(135deg, #B8A4E8, #8E7CD8);
}
.member-avatar-add {
  background: rgba(0, 0, 0, 0.05);
  border: 2rpx dashed rgba(0, 0, 0, 0.18);
}
.member-avatar-img { width: 100%; height: 100%; }
.member-avatar-text { font-size: 24rpx; font-weight: 700; color: #fff; }
.member-avatar-add .member-avatar-text { color: var(--color-text-3); }
.member-name {
  font-size: 30rpx;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 刷新提示 */
.refresh-hint {
  text-align: center;
  padding: 16rpx;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-top: 8rpx;
}

.error-text {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-coral);
  margin-top: 12rpx;
}
</style>
