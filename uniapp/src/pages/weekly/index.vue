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
const role = ref('member')          // 默认 member (最严格权限), 由 onLoad 从 getFamilyMembers 校正
const loadingRole = ref(true)

const isOwner = computed(() => role.value === 'owner')

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
    }
  }
})

async function onCopyLast() {
  if (!isOwner.value) return
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
  // 前置权限: 即便绕过 UI, 后端 requireOwner 也会兜底拒绝, 这里给个友好提示
  if (!isOwner.value) {
    uni.showToast({ title: '只有家庭管理员可填写周记账', icon: 'none' })
    return
  }

  const categories = {}
  for (const c of cats.value) {
    categories[c.id] = Math.max(0, Math.round(Number(c.amount) || 0))
  }
  submitting.value = true
  try {
    uni.showLoading({ title: '提交中...' })
    await submitWeekly({ categories })
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

      <!-- 角色徽章 -->
      <view class="role-badge" :class="{ readonly: !isOwner }">
        <text v-if="loadingRole">⏳ 加载中…</text>
        <text v-else-if="isOwner">👑 管理员（可填写）</text>
        <text v-else>👀 只读模式 · 周记账由家庭管理员填写</text>
      </view>

      <text v-if="isOwner" class="text-link copy-link" @tap="onCopyLast">复制上周数据</text>

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
            :disabled="!isOwner || submitting"
            :placeholder="isOwner ? '' : '—'"
          />
        </view>
      </view>

      <view class="week-total">
        本周合计 <text class="wt-val">¥{{ total }}</text>
      </view>

      <button
        v-if="isOwner"
        class="grad-btn"
        :disabled="submitting"
        @tap="onSubmit"
      >提交</button>
      <text v-else class="readonly-hint">如需补录本周支出，请联系家庭管理员</text>
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
.role-badge.readonly {
  background: rgba(168, 85, 247, 0.10);
  color: #A855F7;
}
.readonly-hint {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-text-3);
  margin-top: 16rpx;
}
</style>
