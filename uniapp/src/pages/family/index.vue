<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { listCities, getFamilyProfile, saveFamilyProfile } from '@/services/api'
import { useWizardStore } from '@/stores/wizard'
import { track } from '@/utils/analytics'

const wizard = useWizardStore()

const familyName = ref('我的家')
const city = ref('上海')
const stage = ref('newlywed')

// 城市列表（来自 listCities；按 tier 分组便于查找）
const cityGroups = ref([])
const loading = ref(true)
const citiesError = ref('')
const profileError = ref('')

onMounted(async () => {
  // 家庭档案以云端为单一来源，避免伴侣两端看到的名字/城市不一致
  try {
    const r = await getFamilyProfile()
    if (r && r.profile) {
      familyName.value = r.profile.name
      city.value = r.profile.city
      stage.value = r.profile.stage
      resetOriginal()
    }
  } catch (e) {
    profileError.value = e && e.userHint ? e.userHint : '家庭档案加载失败'
  }

  try {
    const r = await listCities()
    const order = [
      { tier: 'tier1', label: '一线城市' },
      { tier: 'tier2', label: '新一线' },
      { tier: 'tier3', label: '其他城市' },
    ]
    cityGroups.value = order
      .map(g => ({
        label: g.label,
        items: r.cities
          .filter(c => c.tier === g.tier)
          .map(c => c.name),
      }))
      .filter(g => g.items.length > 0)
  } catch (e) {
    citiesError.value = e.message || '城市列表加载失败'
  } finally {
    loading.value = false
  }
})

// 阶段取值与文案必须与向导 step1 和引擎口径一致：
// 原实现用了 tts / future 两个引擎不认识的 key，保存后会导致测算拿不到阶段系数。
const stages = [
  { key: 'newlywed', label: '新婚磨合期', desc: '暂时没打算要娃，专注二人世界' },
  { key: 'planning', label: '计划未来生育', desc: '1–3 年内有生育计划，开始储备' },
  { key: 'pregnant', label: '正在备孕中', desc: '已经积极备孕，需要更紧的预算' }
]

// 是否已修改（用于显示保存按钮高亮态）
const isDirty = ref(false)
const original = { familyName: '我的家', city: '上海', stage: 'newlywed' }
function resetOriginal() {
  original.familyName = familyName.value
  original.city = city.value
  original.stage = stage.value
  isDirty.value = false
}
function markDirty() {
  isDirty.value = (
    familyName.value !== original.familyName ||
    city.value !== original.city ||
    stage.value !== original.stage
  )
}
function onStageChange(k) {
  stage.value = k
  markDirty()
}

// 点击"所在城市"行：弹出 ActionSheet（按 tier 分组前缀标签）
function onPickCity() {
  if (loading.value) {
    uni.showToast({ title: '城市加载中…', icon: 'none' })
    return
  }
  if (citiesError.value) {
    uni.showToast({ title: citiesError.value, icon: 'none' })
    return
  }
  // ActionSheet 拼成 "分组名 / 城市名"，选中后只取城市名
  const itemList = []
  const flat = []
  cityGroups.value.forEach(g => {
    itemList.push(`── ${g.label} ──`)
    flat.push(null) // 占位：点击分组标题无效
    g.items.forEach(name => {
      itemList.push(name)
      flat.push(name)
    })
  })
  uni.showActionSheet({
    itemList,
    success: (res) => {
      const picked = flat[res.tapIndex]
      if (picked && picked !== city.value) {
        city.value = picked
        wizard.setCity(picked)   // 同步回 wizard.store，保持单一真相
        markDirty()
      }
    },
    fail: () => {}
  })
}

const currentStage = computed(() => stages.find(s => s.key === stage.value))

const saving = ref(false)

async function onSave() {
  if (!isDirty.value) {
    uni.showToast({ title: '没有可保存的修改', icon: 'none' })
    return
  }
  if (saving.value) return

  const name = String(familyName.value || '').trim()
  if (!name) {
    uni.showToast({ title: '家庭名不能为空', icon: 'none' })
    return
  }

  saving.value = true
  // 记录保存前的阶段，用于检测「阶段变更 → 引导重新测算」。
  // 阶段系数（医疗↑娱乐↓等）按 stage 差异化，改了阶段但旧 plan 不重算，
  // 看板里的预算结构就还是旧阶段口径 —— 属于隐性数据不一致（PDD §8.2）。
  // 注意 fromStage 必须在此捕获：保存成功后 original 会被 resetOriginal 覆盖
  const fromStage = original.stage
  const stageChanged = stage.value !== original.stage
  try {
    const r = await saveFamilyProfile({ name, stage: stage.value, city: city.value })
    if (r && r.profile) {
      // 以服务端返回为准：城市等级由服务端按城市名推导，客户端不自行猜测
      familyName.value = r.profile.name
      city.value = r.profile.city
      stage.value = r.profile.stage
      resetOriginal()
      wizard.setCity(city.value)
    }
    if (stageChanged) {
      track('stage_changed', { from: fromStage, to: stage.value })
      // 阶段变了 → 旧方案类目结构已过期，主动引导重新测算而非只 toast
      uni.showModal({
        title: '家庭阶段已更新',
        content: '预算结构会随阶段变化（如备孕后医疗占比上升）。要按新阶段重新测算吗？',
        confirmText: '重新测算',
        cancelText: '暂不用',
        success: (m) => {
          if (m.confirm) {
            uni.redirectTo({ url: '/subpackages/wizard/step1' })
          }
        },
      })
    } else {
      uni.showToast({ title: '已保存', icon: 'success' })
    }
  } catch (e) {
    // 关键：保存失败时绝不清除 isDirty，否则用户会以为已经存上了
    uni.showToast({
      title: (e && e.userHint) || '保存失败，请稍后重试',
      icon: 'none',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭档案" />

    <ScreenBody class="screen-body-scroll family-body">
      <!-- 档案卡（顶部视觉锚点） -->
      <view class="profile-card">
        <view class="avatar">
          <text class="avatar-text">{{ familyName.slice(0, 1) }}</text>
        </view>
        <view class="profile-meta">
          <text class="profile-name">{{ familyName }}</text>
          <text class="profile-sub">{{ city }} · {{ currentStage ? currentStage.label : '—' }}</text>
        </view>
      </view>

      <!-- 读取失败时给出明确提示，避免用户对着默认值以为已同步 -->
      <text v-if="profileError" class="form-hint form-hint-error">{{ profileError }}</text>

      <!-- 基本信息组 -->
      <view class="form-section">
        <text class="section-title">基本信息</text>
        <view class="form-card">
          <view class="form-row">
            <text class="form-label">家庭名称</text>
            <input
              v-model="familyName"
              type="text"
              class="form-input"
              placeholder="请输入家庭名称"
              @input="markDirty"
            />
          </view>
          <view class="form-divider" />
          <view class="form-row" @tap="onPickCity">
            <text class="form-label">所在城市</text>
            <text class="form-value">{{ city }}</text>
            <text class="form-chev">›</text>
          </view>
        </view>
      </view>

      <!-- 家庭阶段组 -->
      <view class="form-section">
        <text class="section-title">家庭阶段</text>
        <view class="form-card">
          <view
            v-for="(s, i) in stages"
            :key="s.key"
            class="form-stage-row"
            :class="{ selected: stage === s.key, last: i === stages.length - 1 }"
            @tap="onStageChange(s.key)"
          >
            <view class="stage-info">
              <text class="stage-label">{{ s.label }}</text>
              <text class="stage-desc">{{ s.desc }}</text>
            </view>
            <view class="stage-radio" :class="{ on: stage === s.key }">
              <view v-if="stage === s.key" class="stage-radio-dot" />
            </view>
          </view>
        </view>
        <text class="form-hint" v-if="isDirty">已修改，阶段变更后建议重新测算</text>
      </view>
    </ScreenBody>

    <!-- 底部保存栏（始终可见，未修改时灰色态） -->
    <view class="form-bottom-bar">
      <button
        class="save-btn"
        :class="{ active: isDirty }"
        :disabled="saving"
        @tap="onSave"
      >
        {{ saving ? '保存中…' : (isDirty ? '保存修改' : '已保存') }}
      </button>
    </view>
  </view>
</template>

<style>
/* === 档案卡 === */
.profile-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, rgba(255, 107, 138, 0.12), rgba(168, 85, 247, 0.08));
  border: 1rpx solid rgba(255, 107, 138, 0.12);
}
.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  background: var(--grad-hero);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(255, 107, 138, 0.28);
  flex-shrink: 0;
}
.avatar-text {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.profile-meta { display: flex; flex-direction: column; gap: 8rpx; }
.profile-name {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-text);
}
.profile-sub {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
}

/* === 表单分组 === */
.form-section { margin-bottom: 32rpx; }
.section-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-text-3);
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}
.form-card {
  background: var(--color-surface);
  border-radius: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(28, 25, 23, 0.04);
  overflow: hidden;
}

/* === 行（仿 iOS 设置页） === */
.form-row {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: 24rpx 32rpx;
  box-sizing: border-box;
}
.form-label {
  flex-shrink: 0;
  font-size: 30rpx;
  color: var(--color-text);
}
.form-input {
  flex: 1;
  text-align: right;
  font-size: 30rpx;
  color: var(--color-text);
  background: transparent;
  border: none;
}
.form-value {
  flex: 1;
  text-align: right;
  font-size: 30rpx;
  color: var(--color-text);
}
.form-chev {
  margin-left: 12rpx;
  font-size: 32rpx;
  color: var(--color-text-3);
  line-height: 1;
}
.form-divider {
  height: 1rpx;
  background: var(--color-border);
  margin: 0 32rpx;
}

/* === 阶段选择（iOS 列表式） === */
.form-stage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 120rpx;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid var(--color-border);
  box-sizing: border-box;
}
.form-stage-row.last { border-bottom: none; }
.form-stage-row.selected { background: rgba(255, 107, 138, 0.04); }
.stage-info { display: flex; flex-direction: column; gap: 6rpx; flex: 1; }
.stage-label {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-text);
}
.stage-desc {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
}
.stage-radio {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(28, 25, 23, 0.15);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 16rpx;
}
.stage-radio.on {
  border-color: var(--color-coral);
  border-width: 2rpx;
}
.stage-radio-dot {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  background: var(--color-coral);
}

.form-hint {
  display: block;
  font-size: 24rpx;
  color: var(--color-coral);
  margin-top: 16rpx;
  padding-left: 8rpx;
}
.form-hint-error {
  color: var(--color-danger);
  margin: 0 0 16rpx;
}

/* === 底部保存栏 === */
.family-body .screen-body-inner { padding-bottom: 220rpx; }
.form-bottom-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 24rpx 40rpx calc(24rpx + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24rpx);
  border-top: 1rpx solid var(--color-border);
  box-sizing: border-box;
  z-index: 10;
}
.save-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
  background: #C8C5C0;
  border: none;
  border-radius: 999rpx;
  margin: 0;
  transition: background 0.2s;
}
.save-btn::after { border: none; }
.save-btn.active {
  background: var(--grad-btn);
  box-shadow: 0 12rpx 32rpx rgba(255, 107, 138, 0.35);
}
</style>
