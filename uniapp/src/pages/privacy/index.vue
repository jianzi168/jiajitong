<script setup>
import ScreenBody from '@/components/ScreenBody.vue'
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { exportData, deleteAccount } from '@/services/api.js'
import { toDateString } from '@/utils/datetime.js'

const loading = ref('')

const items = [
  { key: 'pdf', label: '导出规划书 PDF', danger: false },
  { key: 'csv', label: '导出预算数据 CSV', danger: false },
  { key: 'policy', label: '查看隐私政策', danger: false },
  { key: 'delete', label: '注销账号并删除数据', danger: true }
]

/** 下载 JSON 数据为文件 */
function downloadJSON(data, filename) {
  const fs = uni.getFileSystemManager()
  const dir = `${wx.env.USER_DATA_PATH}`
  const path = `${dir}/${filename}`
  try { fs.accessSync(dir) } catch (e) { fs.mkdirSync(dir) }
  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
  return path
}

/** 将 plan 数据格式化为 CSV */
function plansToCSV(data) {
  const lines = ['类型,字段,值']
  lines.push(`用户,昵称,${data.user?.nickname || ''}`)
  if (data.family) {
    lines.push(`家庭,阶段,${data.family.stage || ''}`)
    lines.push(`家庭,城市,${data.family.city || ''}`)
  }
  if (data.plans && data.plans.length > 0) {
    const p = data.plans[0]
    lines.push(`预算,健康分,${p.health_score || ''}`)
    lines.push(`预算,风险等级,${p.risk_level || ''}`)
    if (p.categories) {
      p.categories.forEach(c => {
        lines.push(`预算分类,${c.name},建议${c.suggested}`)
      })
    }
  }
  if (data.entries && data.entries.length > 0) {
    data.entries.forEach(e => {
      lines.push(`周记账,${e.week_start},总计${e.total}`)
    })
  }
  return lines.join('\n')
}

async function onItem(item) {
  if (loading.value) return

  if (item.key === 'delete') {
    uni.showModal({
      title: '确认注销？',
      content: '注销后所有数据将被永久删除，无法恢复。此操作不可撤销。',
      confirmText: '确认注销',
      confirmColor: '#DC2626',
      success: async (res) => {
        if (!res.confirm) return
        // 二次确认
        uni.showModal({
          title: '再次确认',
          content: '你确定要注销账号并删除所有数据吗？',
          confirmText: '是的，删除',
          confirmColor: '#DC2626',
          success: async (res2) => {
            if (!res2.confirm) return
            loading.value = item.key
            try {
              await deleteAccount()
              // 清除本地缓存
              uni.clearStorageSync()
              uni.showToast({ title: '账号已注销', icon: 'success', duration: 2000 })
              setTimeout(() => {
                uni.reLaunch({ url: '/pages/landing/index' })
              }, 2000)
            } catch (e) {
              uni.showToast({ title: e.userHint || '注销失败，请稍后重试', icon: 'none' })
            } finally {
              loading.value = ''
            }
          }
        })
      }
    })
    return
  }

  if (item.key === 'policy') {
    uni.navigateTo({ url: '/pages/privacy/policy' })
    return
  }

  // PDF 或 CSV 导出
  loading.value = item.key
  try {
    uni.showLoading({ title: '导出中...', mask: true })
    const data = await exportData()
    uni.hideLoading()

    if (item.key === 'csv') {
      const csv = plansToCSV(data)
      const path = downloadJSON(null, `家计通数据_${toDateString()}.csv`)
      // overwrite with CSV content
      uni.getFileSystemManager().writeFileSync(path, '\uFEFF' + csv, 'utf8') // BOM for Excel
      uni.showToast({ title: 'CSV 已保存', icon: 'success' })
    } else {
      // PDF 导出：当前以 JSON 格式保存
      const path = downloadJSON(data, `家计通规划书_${toDateString()}.json`)
      uni.showToast({ title: '规划书已保存', icon: 'success' })
    }
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.userHint || '导出失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = ''
  }
}
</script>

<template>
  <view class="screen">
    <NavBar title="隐私与导出" />

    <ScreenBody class="screen-body-scroll">
      <view class="menu-stack">
        <button
          v-for="item in items"
          :key="item.key"
          class="menu-item"
          :disabled="!!loading"
          @tap="onItem(item)"
        >
          <text :class="{ 'text-danger': item.danger }">
            {{ loading === item.key ? '处理中...' : item.label }}
          </text>
          <text v-if="!item.danger && loading !== item.key">›</text>
        </button>
      </view>

      <view class="footer-note">
        <text>根据《个人信息保护法》，你有权导出和删除你的数据。</text>
      </view>
    </ScreenBody>
  </view>
</template>

<style scoped>
.footer-note {
  padding: 48rpx 40rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-text-secondary);
}
</style>
