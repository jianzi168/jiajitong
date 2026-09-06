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
  // 1. 先并行拉数据: 本周 entry + 家庭成员(用于判定角色)
  const tasks = [
    getCurrentWeekly().catch((e) => {
      uni.showToast({ title: e.userHint || e.message || '加载失败', icon: 'none' })
      return null
    }),
    getFamilyMembers().catch(() => null),
  ]
  const [weeklyRes, membersRes] = await Promise.all(tasks)
  members.value = membersRes || null

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
    setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 500)
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
</style>
