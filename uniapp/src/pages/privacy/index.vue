<script setup>
import NavBar from '@/components/NavBar.vue'

const items = [
  { key: 'pdf', label: '导出规划书 PDF', danger: false },
  { key: 'csv', label: '导出预算数据 CSV', danger: false },
  { key: 'policy', label: '查看隐私政策', danger: false },
  { key: 'delete', label: '注销账号并删除数据', danger: true }
]

function onItem(item) {
  if (item.danger) {
    uni.showModal({
      title: '确认注销？',
      content: '注销后所有数据将被永久删除，无法恢复',
      confirmText: '确认注销',
      confirmColor: '#DC2626',
      success: (res) => {
        if (res.confirm) {
          uni.showToast({ title: '已提交注销申请', icon: 'none' })
        }
      }
    })
  } else {
    uni.showToast({ title: '待接入：' + item.label, icon: 'none' })
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="隐私与导出" />

    <view class="screen-body screen-body-scroll">
      <view class="menu-stack">
        <button
          v-for="item in items"
          :key="item.key"
          class="menu-item"
          @tap="onItem(item)"
        >
          <text :class="{ 'text-danger': item.danger }">{{ item.label }}</text>
          <text v-if="!item.danger">›</text>
        </button>
      </view>
    </view>
  </view>
</template>