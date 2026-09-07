<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { getCurrentWeekly, copyLastWeek, submitWeekly, getFamilyMembers } from '@/services/api'
import { track, trackPage } from '@/utils/analytics'

const CATEGORIES = [
  { id: 'food',          label: '餐饮' },
  { id: 'daily',         label: '日用' },
  { id: 'entertainment', label: '娱乐' },
  { id: 'medical',       label: '医疗' },
  { id: 'clothing',      label: '服饰' },
  { id: 'transport',     label: '交通通讯' },
  { id: 'other',         label: '其他' },
]

const cats = ref(CATEGORIES.map((c) => ({ ...c, amount: '' })))
const weekBadge = ref('')
const submitting = ref(false)
const role = ref('member')          // 由 onLoad 从 getFamilyMembers 校正
const loadingRole = ref(true)
const members = ref(null)           // { owner, members: [] } —— 用于把 openid 显示成昵称
const submitterOpenid = ref('')

const isOwner = computed(() => role.value === 'owner')

/** 本周填报人的昵称；查不到则退回落款「家人」 */
const submitterLabel = computed(() => {
  const openid = submitterOpenid.value
  if (!openid) return ''
  const m = members.value
  if (!m) return '家人'
  if (m.owner && m.owner.openid === openid) return m.owner.nickname || '管理员'
  const hit = (m.members || []).find((x) => x.openid === openid)
  return (hit && hit.nickname) || '家人'
})

const total = computed(() => {
  const sum = cats.value.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  return sum.toLocaleString('zh-CN')
})

// ---------- 本周 vs 上周环比（PDD §8.1「周度小结」的应用内部分） ----------
// 数据源复用 copyLastWeek 只读接口（与「复制上周」同一数据源，不新增 action）
const lastWeekTotal = ref(null) // null = 上周无数据

const weekDelta = computed(() => {
  const cur = cats.value.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  const prev = lastWeekTotal.value
  if (prev === null || prev === undefined || !Number.isFinite(prev)) return null
  if (prev === 0) return cur > 0 ? { dir: 'up', pct: null, prev } : null
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return { dir: 'flat', pct: 0, prev }
  return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct), prev }
})

const weekDeltaText = computed(() => {
  const d = weekDelta.value
  if (!d) return ''
  const prevStr = `上周 ¥${Number(d.prev).toLocaleString('zh-CN')}`
  if (d.dir === 'flat') return `${prevStr} · 与上周持平`
  const arrow = d.dir === 'up' ? '↑' : '↓'
  return d.pct === null ? `${prevStr} · 本周开始有支出` : `${prevStr} · 本周${arrow}${d.pct}%`
})

function getCurrentOpenid() {
  // 优先级: session 写入的 openid (applyProfile)
  try {
    const cached = uni.getStorageSync('openid')
    if (cached) return cached
  } catch (e) {}
  return ''
}

onLoad(async () => {
  trackPage('weekly')
  // 1. 先并行拉数据: 本周 entry + 家庭成员(用于判定角色) + 上周(环比对比)
  const tasks = [
    getCurrentWeekly().catch((e) => {
      uni.showToast({ title: e.userHint || e.message || '加载失败', icon: 'none' })
      return null
    }),
    getFamilyMembers().catch(() => null),
    copyLastWeek().catch(() => null),
  ]
  const [weeklyRes, membersRes, lastRes] = await Promise.all(tasks)
  members.value = membersRes || null

  // 上周合计（环比基线）；无上周数据时保持 null，环比行不显示
  if (lastRes && lastRes.categories) {
    lastWeekTotal.value = Object.values(lastRes.categories).reduce(
      (acc, v) => acc + (Number(v) || 0), 0
    )
  }

  // 2. 角色判定: owner.openid === 本地 openid → owner, 否则 member
  const myOpenid = getCurrentOpenid()
  const ownerOpenid = membersRes && membersRes.owner && membersRes.owner.openid
  if (myOpenid && ownerOpenid && myOpenid === ownerOpenid) {
    role.value = 'owner'
  } else {
    role.value = 'member'
  }
  loadingRole.value = false

  // 3. 渲染本周 entry
  if (weeklyRes) {
    weekBadge.value = `${weeklyRes.weekStart} — ${weeklyRes.weekEnd}`
    if (weeklyRes.entry && weeklyRes.entry.categories) {
      cats.value = cats.value.map((c) => ({
        ...c,
        amount: String(weeklyRes.entry.categories[c.id] ?? ''),
      }))
      submitterOpenid.value = weeklyRes.entry.submitter_openid || ''
    }
  }
})

async function onCopyLast() {
  try {
    const res = await copyLastWeek()
    if (!res.categories) {
      uni.showToast({ title: '没有上周数据', icon: 'none' })
      return
    }
    cats.value = cats.value.map((c) => ({
      ...c,
      amount: String(res.categories[c.id] ?? ''),
    }))
    uni.showToast({ title: '已复制上周', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.userHint || e.message || '复制失败', icon: 'none' })
  }
}

/**
 * 提交成功后引导开启每周填报提醒（一次性）。
 *
 * 背景：setup-reminder 页面此前没有任何跳转入口（孤岛页面），用户无法
 * 到达授权页 → subscribe_records 恒为空 → 周提醒/超支预警推送发不出去。
 * 填报完成是最自然的授权时机（刚体验完价值，且推送内容与之直接相关）。
 *
 * 只在首次提交成功时弹一次确认框（storage 标记），拒绝后不再打扰——
 * 订阅消息模板未配置时 setup-reminder 页自身会显示「暂未开放」，无副作用。
 *
 * @param {Function} next - 引导流程结束后的去向（通常是回看板）。
 *   用户选择「去开启」时不调用 next：setup-reminder 授权成功后会自行
 *   reLaunch 到 dashboard；取消/关闭时调用 next 继续原跳转。
 */
function maybePromptRemind(next) {
  const goDashboard = () => next && next()
  try {
    if (uni.getStorageSync('remind_prompted')) {
      goDashboard()
      return
    }
  } catch (e) {
    goDashboard()
    return
  }
  uni.showModal({
    title: '开启每周提醒？',
    content: '每周日晚提醒你花 30 秒记录本周家庭支出',
    confirmText: '去开启',
    cancelText: '暂不用',
    success: (r) => {
      try { uni.setStorageSync('remind_prompted', true) } catch (e) {}
      if (r.confirm) {
        uni.navigateTo({ url: '/pages/setup-reminder/index' })
      } else {
        goDashboard()
      }
    },
    fail: goDashboard,
  })
}

async function onSubmit() {
  const categories = {}
  for (const c of cats.value) {
    categories[c.id] = Math.max(0, Math.round(Number(c.amount) || 0))
  }
  submitting.value = true
  try {
    uni.showLoading({ title: '提交中...' })
    const res = await submitWeekly({ categories })
    // 回填填报人，让「本周由谁填报」立即生效
    if (res && res.entry && res.entry.submitter_openid) {
      submitterOpenid.value = res.entry.submitter_openid
    }
    const submitTotal = Object.values(categories).reduce((acc, v) => acc + v, 0)
    track('weekly_submit', { total: submitTotal })
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    // 先弹订阅引导，引导关闭后再回看板（避免 reLaunch 把 modal/引导页冲掉）
    maybePromptRemind(() => {
      setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 500)
    })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || e.message || '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="本周支出" />

    <ScreenBody class="screen-body-scroll">
      <text class="week-badge">{{ weekBadge || '加载中...' }}</text>

      <!-- 角色徽章：家庭成员均可填写，谁花钱谁记 -->
      <view class="role-badge">
        <text v-if="loadingRole">⏳ 加载中…</text>
        <text v-else-if="isOwner">👑 管理员 · 你和伴侣都可以填写</text>
        <text v-else>✍️ 伴侣 · 你和家人都可以填写</text>
      </view>

      <!-- 本周是谁填的：协同可见，避免两人重复填或都不知道填没填 -->
      <text v-if="submitterLabel" class="submitter-hint">本周由 {{ submitterLabel }} 填报</text>

      <text class="text-link copy-link" @tap="onCopyLast">复制上周数据</text>

      <view class="weekly-grid">
        <view
          v-for="c in cats"
          :key="c.id"
          class="weekly-row"
        >
          <text>{{ c.label }}</text>
          <input
            class="field-input"
            type="number"
            :data-id="c.id"
            v-model="c.amount"
            :disabled="submitting"
            placeholder="0"
          />
        </view>
      </view>

      <view class="week-total">
        本周合计 <text class="wt-val">¥{{ total }}</text>
      </view>
      <text v-if="weekDeltaText" class="week-delta">{{ weekDeltaText }}</text>

      <button
        class="grad-btn"
        :disabled="submitting"
        @tap="onSubmit"
      >提交</button>
    </ScreenBody>
  </view>
</template>

<style>
.copy-link {
  display: inline-block;
  margin-bottom: 24rpx;
}
.role-badge {
  display: inline-block;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.12);
  color: #22C55E;
  margin-bottom: 16rpx;
}
.submitter-hint {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-bottom: 12rpx;
}
/* 本周 vs 上周环比：涨红跌绿不符合支出语义——支出涨=注意（橙红），降=好（绿） */
.week-delta {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-top: 8rpx;
}
</style>
