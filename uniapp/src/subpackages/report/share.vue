<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { usePlanStore } from '@/stores/plan'
import { getShareQrCode } from '@/services/api'
import { buildShareModel, drawSharePoster } from '@/utils/poster'
import { resolveQrImage } from '@/utils/shareQr'
import { track } from '@/utils/analytics'

const planStore = usePlanStore()

const loading = ref(true)
const errorMsg = ref('')
const plan = ref(null)
const qrImage = ref('')
const hideRatios = ref(false)
const saving = ref(false)

// 预览画布 CSS 尺寸（与设计稿 750×1334 同比例，左右各留 40rpx）
const PREVIEW_W_RPX = 670
const PREVIEW_H_RPX = Math.round((670 * 1334) / 750) // 1192
const canvasCss = {
  width: uni.upx2px(PREVIEW_W_RPX),
  height: uni.upx2px(PREVIEW_H_RPX),
}

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

  // 2. 拉小程序码 + 适配下载
  try {
    const qr = await getShareQrCode({ page_path: 'pages/landing/index' })
    if (qr && qr.file_id) {
      try {
        qrImage.value = await resolveQrImage(qr, (fileID) => {
          return new Promise((resolve, reject) => {
            uni.cloud.downloadFile({
              fileID,
              success: (res) => resolve(res.tempFilePath || ''),
              fail: (err) => reject(err),
            })
          })
        })
      } catch (e) {
        // fail-quiet: 二维码降级为空, 海报仍生成
        qrImage.value = ''
        errorMsg.value = '二维码加载失败, 已使用占位图'
      }
    }
  } catch (e) {
    // fail-quiet: 用 placeholder
  }

  loading.value = false

  // 3. Canvas 首绘: 等待模板挂载后绘制, 避免拿到空 canvas
  nextTick(() => {
    setTimeout(() => { redraw() }, 0)
  })
})

const shareModel = computed(() => {
  if (!plan.value) return null
  return buildShareModel(plan.value, { scoreOnly: hideRatios.value })
})

// 重新渲染 (响应 hideRatios 切换)
async function redraw() {
  if (!shareModel.value) return
  await drawSharePoster({
    canvasId: 'shareCanvas',
    model: shareModel.value,
    qrImage: qrImage.value,
    pageSize: 'share',
    cssWidth: canvasCss.width,
    cssHeight: canvasCss.height,
  })
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
      // 漏斗事件（PDD 附录 B）：分享长图已保存
      track('share_poster', {})
      uni.showToast({ title: '已保存到相册', icon: 'success' })
    },
    fail: (e) => {
      uni.hideLoading()
      saving.value = false
      uni.showToast({ title: '保存失败: ' + (e.errMsg || ''), icon: 'none' })
    },
  })
}

// Phase 10 商业化关闭：Pro 分享解锁入口已移除（原 goPaywall 跳 /pages/paywall/index）
</script>

<template>
  <view class="share-page">
    <NavBar title="分享预览" />

    <scroll-view scroll-y class="share-scroll" :show-scrollbar="false" :enhanced="true">
      <template v-if="loading">
        <text class="loading-text">加载中…</text>
      </template>
      <template v-else-if="!plan">
        <text class="error-text">未找到规划数据</text>
      </template>
      <template v-else>
        <view class="share-preview">
          <canvas
            canvas-id="shareCanvas"
            id="shareCanvas"
            class="share-canvas"
            :style="{ width: PREVIEW_W_RPX + 'rpx', height: PREVIEW_H_RPX + 'rpx' }"
          />
        </view>
      </template>
    </scroll-view>

    <view v-if="!loading && plan" class="share-footer">
      <view class="check-row">
        <switch :checked="hideRatios" @change="onToggleRatios" color="#FF6B8A" />
        <text>只分享分数，隐藏比例</text>
      </view>

      <button class="grad-btn share-save-btn" :disabled="saving" @tap="onSave">
        {{ saving ? '保存中…' : '保存到相册' }}
      </button>
    </view>
  </view>
</template>

<style scoped>
.share-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.share-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 24rpx 40rpx 16rpx;
}

.share-preview {
  width: 670rpx;
  margin: 0 auto 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 16rpx 48rpx rgba(255, 107, 138, 0.2);
}

.share-canvas {
  display: block;
  width: 670rpx;
  height: 1192rpx;
}

.share-footer {
  flex-shrink: 0;
  padding: 16rpx 40rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  background: rgba(250, 248, 245, 0.96);
  border-top: 1rpx solid var(--color-border, rgba(0, 0, 0, 0.06));
  box-sizing: border-box;
}

.check-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
  font-size: 28rpx;
  color: var(--color-text);
}

.share-save-btn {
  margin-top: 8rpx;
}

.loading-text,
.error-text {
  display: block;
  text-align: center;
  padding: 96rpx 0;
  color: var(--color-text-2);
}

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
