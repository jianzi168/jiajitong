<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { listCities } from '@/services/api'
import { useWizardStore } from '@/stores/wizard'

const wizard = useWizardStore()

const cities = ref([])
const selectedCity = ref('')
const loading = ref(true)
const showPicker = ref(false)
const errorMsg = ref('')

// 把按 tier 分组的城市转为分组列表，便于 UI 渲染
const cityGroups = computed(() => {
  const order = [
    { tier: 'tier1', label: '一线城市' },
    { tier: 'tier2', label: '新一线' },
    { tier: 'tier3', label: '其他城市' },
  ]
  return order
    .map(g => ({
      label: g.label,
      items: cities.value
        .filter(c => c.tier === g.tier)
        .map(c => ({ name: c.name, tier: c.tier })),
    }))
    .filter(g => g.items.length > 0)
})

onMounted(async () => {
  try {
    const r = await listCities()
    cities.value = r.cities
    // 已有 wizard.city（从其它路径带入）→ 沿用；否则默认北京/上海等一线第一城
    if (wizard.city && cities.value.find(c => c.name === wizard.city)) {
      selectedCity.value = wizard.city
    } else {
      selectedCity.value = r.cities[0].name
    }
  } catch (e) {
    errorMsg.value = e.message || '城市列表加载失败'
  } finally {
    loading.value = false
  }
})

function pickCity(name) {
  selectedCity.value = name
  // 即时同步到 wizard store —— 后续无论走完 quick 还是中途跳 wizard，城市都不会丢
  wizard.setCity(name)
  showPicker.value = false
}

function tierLabel(tier) {
  if (tier === 'tier1') return '一线'
  if (tier === 'tier2') return '新一线'
  return '其他'
}

function onNext() {
  if (!selectedCity.value) return
  // 兜底再写一次 store（picker 关闭后再次点击 next 仍能保留）
  wizard.setCity(selectedCity.value)
  uni.redirectTo({
    url: `/pages/quick/step2?city=${encodeURIComponent(selectedCity.value)}`,
  })
}

/**
 * 跳过 quick 直接进入完整规划向导：
 *   - 城市已通过 pickCity 写入 wizard store
 *   - income / housing 由用户后续在 wizard 中填写（不偷塞默认值，保持用户主动）
 */
function onGoWizard() {
  if (!selectedCity.value) {
    uni.showToast({ title: '请先选择城市', icon: 'none' })
    return
  }
  wizard.setCity(selectedCity.value)
  uni.redirectTo({ url: '/subpackages/wizard/step1' })
}

function onCityNotCovered() {
  uni.redirectTo({ url: '/pages/error/city' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <ScreenBody>
      <view class="step-pips step-pips-top">
        <view class="pip on"></view>
        <view class="pip"></view>
        <view class="pip"></view>
      </view>

      <text class="field-heading">你们住在哪？</text>

      <template v-if="loading">
        <view class="field-block"><text>加载中…</text></view>
      </template>

      <template v-else-if="errorMsg">
        <view class="field-block error-block"><text>{{ errorMsg }}</text></view>
      </template>

      <template v-else>
        <view class="field-block select-field" @tap="showPicker = !showPicker">
          <text>{{ selectedCity || '请选择' }}</text>
          <text class="chev">{{ showPicker ? '▲' : '▼' }}</text>
        </view>

        <view v-if="showPicker" class="city-picker">
          <template v-for="g in cityGroups" :key="g.label">
            <view class="city-group-title">
              <text>{{ g.label }}</text>
            </view>
            <view
              v-for="c in g.items"
              :key="c.name"
              class="city-item"
              :class="{ active: c.name === selectedCity }"
              @tap="pickCity(c.name)"
            >
              <text>{{ c.name }}</text>
              <text class="city-tier">{{ tierLabel(c.tier) }}</text>
            </view>
          </template>
        </view>

        <button class="grad-btn" :disabled="!selectedCity" @tap="onNext">下一步</button>

        <!-- 次级入口：选好城市后，可直接进入完整规划（跳过收入/房贷输入） -->
        <view v-if="selectedCity" class="skip-to-wizard">
          <text class="skip-hint">想看完整 5 步规划（含家庭阶段 / 储蓄目标 / 备育）？</text>
          <button class="text-link-btn" @tap="onGoWizard">去完整规划 ›</button>
        </view>
      </template>
    </ScreenBody>
  </view>
</template>

<style>
.city-picker {
  background: var(--color-card, rgba(255,255,255,0.6));
  border-radius: 16rpx;
  padding: 12rpx;
  margin-top: 16rpx;
}
.city-group-title {
  padding: 16rpx 24rpx 8rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-text-3);
}
.city-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid rgba(0,0,0,0.05);
}
.city-item:last-child { border-bottom: none; }
.city-item.active { background: rgba(255, 107, 138, 0.08); }
.city-tier { font-size: 24rpx; color: var(--color-text-2); }
.error-block { color: #c33; }

.skip-to-wizard {
  margin-top: 32rpx;
  text-align: center;
}
.skip-hint {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-2);
  margin-bottom: 12rpx;
}
.text-link-btn {
  background: transparent;
  border: none;
  color: #FF6B8A;
  font-size: 28rpx;
  font-weight: 600;
  padding: 12rpx 24rpx;
  margin: 0;
}
.text-link-btn::after { border: none; }
</style>
