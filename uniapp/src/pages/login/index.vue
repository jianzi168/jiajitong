<script setup>
import NavBar from '@/components/NavBar.vue'

function onWechatLogin() {
  // 模拟登录成功后进入向导
  uni.reLaunch({ url: '/subpackages/wizard/step1' })
}
</script>

<template>
  <view class="screen">
    <NavBar title="登录" />

    <view class="screen-body screen-body-center login-panel">
      <text class="brand-mark">家计通</text>
      <text class="login-copy">登录后保存规划书、一起追踪预算\n数据加密，只用于你们家的财务规划</text>

      <button class="grad-btn grad-btn-wechat" @tap="onWechatLogin">
        <text class="wechat-badge">微</text>
        <text>微信一键登录</text>
      </button>

      <text class="hint-text hint-text-center">登录即表示同意《用户协议》与《隐私政策》</text>
      <text class="hint-text">快测填过的信息会自动带进向导</text>
    </view>
  </view>
</template>