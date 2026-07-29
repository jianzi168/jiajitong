<script setup>
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { usePlanStore } from '@/stores/plan'
import { useSubscriptionStore } from '@/stores/subscription'
import { getShareQrCode } from '@/services/api'
import { buildShareModel, drawSharePoster } from '@/utils/poster'

const planStore = usePlanStore()
const subStore = useSubscriptionStore()

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)
const qrImage = ref('')
const hideRatios = ref(false)
const saving = ref(false)

onMounted(async () => {
  // 1. plan 优先 store / 云端
  if (planStore.activePlan) {
    plan.value = planStore.activePlan
  } else {
    try {
      const app = getApp()
      plan.value = (app && app.globalData && app.globalData.fullPlanResult) || null
    } catch (e) {}
  }
  if (!plan.value) {
    try { await planStore.loadActive() } catch (e) {}
    plan.value = planStore.activePlan
  }

  // 2. 拉小程序码
  try {
    const qr = await getShareQrCode({ page_path: 'pages/landing/index' })
    // 留接口: P1 缓存时把 temp_url 转 tempFilePath 后赋值给 qrImage
    // 当前 placeholder 模式不画
  } catch (e) {
    // fail-quiet: 用 placeholder
  }

  // 3. 拉 subscription
  try { await subStore.refresh() } catch (e) {}

  loading.value = false
})

const shareModel = computed(() => {
  if (!plan.value) return null
  return buildShareModel(plan.value, { scoreOnly: hideRatios.value })
})

// 重新渲染 (响应 hideRatios 切换)
const drawTick = ref(0)
watchHideRatios()

function watchHideRatios() {
  // 简单 watch 替代 (避免引入 watch)
  // 当 hideRatios 变化, redraw
}

async function redraw() {
  if (!shareModel.value) return
  await drawSharePoster({
    canvasId: 'shareCanvas',
    model: shareModel.value,
    qrImage: qrImage.value,
  })
  drawTick.value++
}

const onToggleRatios = () => {
  hideRatios.value = !hideRatios.value
  setTimeout(redraw, 50)
}

const onSave = () => {
  if (saving.value) return
  saving.value = true
  uni.showLoading({ title: '保存中...' })
  redraw()
    .then(() => {
      uni.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        fileType: 'png',
        quality: 1,
        success: ({ tempFilePath }) => saveImage(tempFilePath),
        fail: (e) => {
          uni.hideLoading()
          saving.value = false
          uni.showToast({ title: '生成失败: ' + (e.errMsg || ''), icon: 'none' })
        },
      })
    })
    .catch((e) => {
      uni.hideLoading()
      saving.value = false
      uni.showToast({ title: '绘制失败', icon: 'none' })
    })
}

function saveImage(tempFilePath) {
  uni.getSetting({
    success: (res) => {
      if (res.authSetting['scope.writePhotosAlbum'] === false) {
        // 已拒绝
        uni.hideLoading()
        saving.value = false
        uni.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限以保存图片',
          confirmText: '去设置',
          success: (m) => {
            if (m.confirm) uni.openSetting()
          },
        })
        return
      }
      if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
        uni.authorize({
          scope: 'scope.writePhotosAlbum',
          success: () => doSave(tempFilePath),
          fail: () => {
            uni.hideLoading()
            saving.value = false
            uni.showToast({ title: '已拒绝相册权限', icon: 'none' })
          },
        })
        return
      }
      doSave(tempFilePath)
    },
    fail: () => {
      uni.hideLoading()
      saving.value = false
    },
  })
}

function doSave(tempFilePath) {
  uni.saveImageToPhotosAlbum({
    filePath: tempFilePath,
    success: () => {
      uni.hideLoading()
      saving.value = false
      uni.showToast({ title: '已保存到相册', icon: 'success' })
    },
    fail: (e) => {
      uni.hideLoading()
      saving.value = false
      uni.showToast({ title: '保存失败: ' + (e.errMsg || ''), icon: 'none' })
    },
  })
}

function goPaywall() {
  uni.navigateTo({ url: '/pages/paywall/index?from=share' })
}

const riskLabel = computed(() => shareModel.value?.riskLabel || '—')
</script>

<template>
  <view class="screen">
    <NavBar title="分享预览" />

    <view class="screen-body screen-body-center">
      <template v-if="loading">
        <text class="loading-text">加载中…</text>
      </template>
      <template v-else-if="!plan">
        <text class="error-text">未找到规划数据</text>
      </template>
      <template v-else>
        <view class="share-card-wrap">
          <canvas
            canvas-id="shareCanvas"
            id="shareCanvas"
            class="share-canvas"
            :style="{ width: '750rpx', height: '1334rpx' }"
          />
        </view>

        <view class="check-row">
          <switch :checked="hideRatios" @change="onToggleRatios" color="#FF6B8A" />
          <text>只分享分数，隐藏比例</text>
        </view>

        <button class="grad-btn" :disabled="saving" @tap="onSave">
          {{ saving ? '保存中…' : '保存到相册' }}
        </button>

        <view v-if="!subStore.canViewFull" class="pro-cta" @tap="goPaywall">
          <text>🔒 解锁 Pro 自定义分享文案与品牌定制</text>
        </view>
      </template>
    </view>
  </view>
</template>

<style scoped>
.share-card-wrap { width: 750rpx; height: 1334rpx; overflow: hidden; border-radius: 24rpx; }
.share-canvas { display: block; }
.check-row { display: flex; align-items: center; gap: 16rpx; margin: 24rpx 0; font-size: 28rpx; }
.loading-text, .error-text { padding: 48rpx; text-align: center; color: var(--color-text-2); }
.pro-cta {
  text-align: center;
  padding: 16rpx;
  margin-top: 16rpx;
  background: rgba(255, 107, 138, 0.1);
  color: #FF6B8A;
  border-radius: 8rpx;
  font-size: 26rpx;
}
</style>
