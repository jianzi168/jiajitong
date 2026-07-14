<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'

const familyName = ref('晓雯的家庭')
const city = ref('上海')

// 城市列表（与 quick/step1 一致；按城市等级分组便于查找）
const cityGroups = [
  {
    label: '一线城市',
    items: ['北京', '上海', '广州', '深圳']
  },
  {
    label: '新一线',
    items: ['成都', '杭州', '重庆', '苏州', '武汉', '西安', '南京', '长沙', '天津', '郑州', '青岛', '东莞', '宁波', '佛山', '合肥']
  },
  {
    label: '其他城市',
    items: ['临沂', '其他城市']
  }
]
const allCities = cityGroups.flatMap(g => g.items)

const stages = [
  { key: 'newlywed', label: '新婚磨合期', desc: '暂时还没打算要娃' },
  { key: 'tts', label: '备孕中', desc: '正在认真准备要宝宝' },
  { key: 'future', label: '计划未来生育', desc: '选好大概的年份就行' }
]
const stage = ref('tts')

// 是否已修改（用于显示保存按钮高亮态）
const isDirty = ref(false)
const original = { familyName: familyName.value, city: city.value, stage: stage.value }
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

// 点击"所在城市"行：弹出 ActionSheet
function onPickCity() {
  uni.showActionSheet({
    itemList: allCities,
    success: (res) => {
      const picked = allCities[res.tapIndex]
      if (picked && picked !== city.value) {
        city.value = picked
        markDirty()
      }
    },
    fail: () => {}
  })
}

const currentStage = computed(() => stages.find(s => s.key === stage.value))

function onSave() {
  if (!isDirty.value) {
    uni.showToast({ title: '没有可保存的修改', icon: 'none' })
    return
  }
  uni.showLoading({ title: '保存中…' })
  setTimeout(() => {
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    original.familyName = familyName.value
    original.city = city.value
    original.stage = stage.value
    isDirty.value = false
  }, 600)
}
</script>

<template>
  <view class="screen">
    <NavBar title="家庭档案" />

    <view class="screen-body screen-body-scroll family-body">
      <!-- 档案卡（顶部视觉锚点） -->
      <view class="profile-card">
        <view class="avatar">
          <text class="avatar-text">{{ familyName.slice(0, 1) }}</text>
        </view>
        <view class="profile-meta">
          <text class="profile-name">{{ familyName }}</text>
          <text class="profile-sub">{{ city }} · {{ currentStage.label }}</text>
        </view>
      </view>

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
    </view>

    <!-- 底部保存栏（始终可见，未修改时灰色态） -->
    <view class="form-bottom-bar">
      <button
        class="save-btn"
        :class="{ active: isDirty }"
        @tap="onSave"
      >
        {{ isDirty ? '保存修改' : '已保存' }}
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

/* === 底部保存栏 === */
.family-body { padding-bottom: 220rpx; }
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
