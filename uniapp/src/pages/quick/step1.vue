<script setup>
import { ref, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import engineClient from '@/utils/engineClient.js'

const cities = ref([])
const selectedCity = ref('')
const loading = ref(true)
const showPicker = ref(false)
const errorMsg = ref('')

onMounted(async () => {
  try {
    const r = await engineClient.callCitiesList()
    cities.value = r.cities
    selectedCity.value = r.cities[0].name // 默认上海
  } catch (e) {
    errorMsg.value = e.message || '城市列表加载失败'
  } finally {
    loading.value = false
  }
})

function pickCity(name) {
  selectedCity.value = name
  showPicker.value = false
}

function onNext() {
  if (!selectedCity.value) return
  uni.redirectTo({
    url: `/pages/quick/step2?city=${encodeURIComponent(selectedCity.value)}`,
  })
}

function onCityNotCovered() {
  uni.redirectTo({ url: '/pages/error/city' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <view class="screen-body">
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
        <button class="text-link" @tap="onCityNotCovered">演示：城市还没覆盖</button>
      </template>

      <template v-else>
        <view class="field-block select-field" @tap="showPicker = !showPicker">
          <text>{{ selectedCity || '请选择' }}</text>
          <text class="chev">{{ showPicker ? '▲' : '▼' }}</text>
        </view>

        <view v-if="showPicker" class="city-picker">
          <view
            v-for="c in cities"
            :key="c.name"
            class="city-item"
            :class="{ active: c.name === selectedCity }"
            @tap="pickCity(c.name)"
          >
            <text>{{ c.name }}</text>
            <text class="city-tier">{{ c.tier === 'tier1' ? '一线' : '新一线' }}</text>
          </view>
          <view class="city-item city-more" @tap="onCityNotCovered">
            <text>更多城市即将开放…</text>
          </view>
        </view>

        <button class="grad-btn" :disabled="!selectedCity" @tap="onNext">下一步</button>
      </template>
    </view>
  </view>
</template>

<style>
.city-picker {
  background: var(--color-card, rgba(255,255,255,0.6));
  border-radius: 16rpx;
  padding: 12rpx;
  margin-top: 16rpx;
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
.city-more { color: var(--color-text-2); justify-content: center; }
.error-block { color: #c33; }
</style>