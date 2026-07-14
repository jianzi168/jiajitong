<script setup>
import NavBar from '@/components/NavBar.vue'
import { ref } from 'vue'

const income = ref('32,000')

function onIncomeInput(e) {
  income.value = e.detail.value
}

function onSliderChange(e) {
  income.value = Number(e.detail.value).toLocaleString('en-US')
}

function onNext() {
  uni.navigateTo({ url: '/pages/quick/step3' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="快速测算" />

    <view class="screen-body">
      <view class="step-pips step-pips-top">
        <view class="pip on"></view>
        <view class="pip on"></view>
        <view class="pip"></view>
      </view>

      <text class="field-heading">家庭月收入（税后）</text>
      <view class="field-block money-field">
        <text>¥</text>
        <input class="field-input" type="text" :value="income" @input="onIncomeInput" />
      </view>

      <text class="hint-text">拖一拖滑块也能快速改</text>
      <slider
        class="slider-field"
        :value="32000"
        min="10000"
        max="80000"
        :step="1000"
        activeColor="#FF6B8A"
        backgroundColor="rgba(28, 25, 23, 0.1)"
        block-color="#FF6B8A"
        block-size="20"
        @change="onSliderChange"
      />

      <button class="grad-btn" @tap="onNext">下一步</button>
    </view>
  </view>
</template>
