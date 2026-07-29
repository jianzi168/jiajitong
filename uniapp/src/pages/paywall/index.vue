<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { useSubscriptionStore } from '@/stores/subscription'
import { createOrder, mockPayOrder } from '@/services/api'

const subStore = useSubscriptionStore()

const purchasing = ref(false)  // 全局支付中, 锁所有按钮
const errorMsg = ref('')

// Phase 8: 前端 fallback 价格 (云端 app_config 不可达时使用)
const FALLBACK_PRICES = {
  report_once: 1990,
  pro_yearly: 6800,
  pro_family: 12800,
}

function fmtFen(fen) {
  const yuan = fen / 100
  return '¥' + yuan.toFixed(yuan % 1 === 0 ? 0 : 1)
}

function fmtDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const subBadge = ref('')

onShow(async () => {
  errorMsg.value = ''
  try {
    await subStore.refresh()
    renderBadge()
  } catch (e) {
    // fail-closed: 仍允许购买
  }
})

function renderBadge() {
  if (subStore.isPro) {
    subBadge.value = `当前：Pro 会员 · ${fmtDate(subStore.subscription?.expires_at)} 到期`
  } else if (subStore.isReportOnce) {
    subBadge.value = `当前：单次报告 · ${fmtDate(subStore.subscription?.expires_at)} 到期`
  } else {
    subBadge.value = ''
  }
}

async function onPick(sku) {
  if (purchasing.value) return
  if (sku === 'pro_family') {
    uni.showToast({ title: '家庭版计划于 Phase 10 推出', icon: 'none' })
    return
  }
  purchasing.value = true
  errorMsg.value = ''
  try {
    // 1. 创建订单
    const client_request_id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const created = await createOrder({ sku, client_request_id })
    if (!created || !created.order || !created.payment) {
      throw new Error('订单创建失败')
    }
    // 2. Mock 支付 (本期固定 mock; 真支付时按 payment.mode 分支)
    if (created.payment.mock === true) {
      await subStore.markPaid(created.order._id)
    } else {
      throw new Error('当前不支持的真实支付模式')
    }
    // 3. 刷新 store 确认
    await subStore.refresh({ force: true })
    renderBadge()
    uni.showToast({ title: '已开通', icon: 'success' })
    // 4. 跳回 report/full (来自 preview 的解锁入口)
    setTimeout(() => {
      uni.reLaunch({ url: '/subpackages/report/full' })
    }, 600)
  } catch (e) {
    errorMsg.value = e.userHint || e.message || '购买失败'
    uni.showToast({ title: errorMsg.value, icon: 'none' })
  } finally {
    purchasing.value = false
  }
}

const cards = [
  {
    key: 'single',
    sku: 'report_once',
    title: '单次完整报告',
    desc: '完整 7 类预算 + 全部建议 + 7 天 Pro',
    badge: '尝鲜首选',
    featured: false,
    btn: '立即购买',
    btnClass: 'grad-btn-outline',
  },
  {
    key: 'pro',
    sku: 'pro_yearly',
    title: 'Pro 年付',
    desc: '一年无限次测算 + 全部建议 + PDF 导出',
    badge: '推荐',
    featured: true,
    btn: '开通 Pro',
    btnClass: '',
  },
  {
    key: 'family',
    sku: 'pro_family',
    title: '家庭版',
    desc: '伴侣协同 + 备育模板',
    badge: '敬请期待',
    featured: false,
    btn: '敬请期待',
    btnClass: 'grad-btn-outline',
  },
]
</script>

<template>
  <view class="screen">
    <NavBar title="解锁完整规划" />

    <view class="screen-body screen-body-scroll">
      <view v-if="subBadge" class="sub-badge glass-card">
        <text>{{ subBadge }}</text>
      </view>

      <view
        v-for="card in cards"
        :key="card.key"
        class="glass-card price-card"
        :class="{ 'price-card-featured': card.featured }"
      >
        <view v-if="card.badge" class="price-badge">{{ card.badge }}</view>
        <text class="text-strong">{{ card.title }}</text>
        <text v-if="card.desc" class="hint-text">{{ card.desc }}</text>

        <view v-if="card.featured" class="price-hero">{{ fmtFen(FALLBACK_PRICES[card.sku]) }}<text class="unit">/年</text></view>
        <view v-else-if="card.sku !== 'pro_family'" class="price-hero">{{ fmtFen(FALLBACK_PRICES[card.sku]) }}</view>

        <button
          class="grad-btn"
          :class="card.btnClass"
          :disabled="purchasing || card.sku === 'pro_family'"
          @tap="onPick(card.sku)"
        >
          {{ purchasing ? '处理中…' : card.btn }}
        </button>
      </view>

      <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>
      <text class="hint-text hint-text-center">当前为 Mock 支付演示环境，不发生真实扣款</text>
    </view>
  </view>
</template>

<style scoped>
.sub-badge {
  margin-bottom: 16rpx;
  padding: 16rpx 24rpx;
  text-align: center;
  font-size: 26rpx;
  color: #FF6B8A;
}
.price-card .hint-text { margin-top: 8rpx; margin-bottom: 24rpx; text-align: left; }
.price-card .text-strong { display: block; font-size: 32rpx; margin-bottom: 8rpx; }
.price-hero { font-size: 48rpx; font-weight: 700; color: #FF6B8A; margin: 16rpx 0; }
.price-hero .unit { font-size: 24rpx; color: var(--color-text-2); font-weight: 400; margin-left: 8rpx; }
.error-text { display: block; margin-top: 16rpx; color: #c33; font-size: 26rpx; text-align: center; }
.hint-text-center { display: block; text-align: center; margin-top: 16rpx; color: var(--color-text-2); font-size: 22rpx; }
</style>
