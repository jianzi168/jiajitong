/**
 * 订阅权益 Pinia Store（Phase 8 引入）
 *
 * 单一权威来源：subscription / effective_plan_type / entitlements
 * 前端所有 blur 判定都走这个 store。
 *
 * 数据来源：services/api（getSubscription / mockPayOrder）
 *
 * Fail-closed 原则：
 *   - 初始 loading=true, canViewFull=false
 *   - 网络错误 / 解析失败 → 按 free 算, 不复用可能已过期的正向缓存
 *   - clear() 退出登录或家庭切换时使用
 */

import { defineStore } from 'pinia'
import { getSubscription, mockPayOrder } from '@/services/api'

function defaultEntitlements() {
  return {
    canViewFull: false,
    canExportPdf: false,
    canShareFree: true,    // 任何用户都可分享
    daysRemaining: null,
  }
}

export const useSubscriptionStore = defineStore('subscription', {
  state: () => ({
    subscription: null,        // { plan_type, expires_at, started_at, source_order_id }
    effectivePlanType: 'free', // 实时计算, 包含过期降级
    entitlements: defaultEntitlements(),
    serverNow: 0,
    loading: false,
    error: null,
    loaded: false,
    _inflight: null,           // 并发去重
  }),
  getters: {
    isPro: (s) => s.effectivePlanType === 'pro_yearly' || s.effectivePlanType === 'pro_family',
    isReportOnce: (s) => s.effectivePlanType === 'report_once',
    isFree: (s) => s.effectivePlanType === 'free' || s.entitlements.canViewFull === false,
    canViewFull() { return this.entitlements.canViewFull },
    canExportPdf() { return this.entitlements.canExportPdf },
    daysToExpire() { return this.entitlements.daysRemaining },
  },
  actions: {
    /**
     * 用后端响应直接 hydrate（user.bootstrap / subscription.get / orders.mockPay 都可）
     * @param {object|null} data
     */
    hydrate(data) {
      if (!data) {
        this.clear()
        return
      }
      this.subscription = data.subscription || null
      this.effectivePlanType = data.effective_plan_type || 'free'
      this.entitlements = data.entitlements || defaultEntitlements()
      this.serverNow = data.server_now || Date.now()
      this.loaded = true
      this.error = null
    },

    /**
     * 拉后端 subscription.get; 并发去重
     * @param {object} opts - { force: boolean }
     */
    async refresh({ force = false } = {}) {
      if (this._inflight && !force) return this._inflight
      if (this.loading && !force) {
        // 已经有别的入口在加载, 等待它
        return this._inflight || this._waitInflight()
      }
      this.loading = true
      this.error = null
      this._inflight = (async () => {
        try {
          const res = await getSubscription()
          this.hydrate(res)
          return res
        } catch (e) {
          this.error = e.userHint || e.message || String(e)
          // fail-closed: 保持 entitlements 默认值 (free)
          this.loaded = true
          throw e
        } finally {
          this.loading = false
          this._inflight = null
        }
      })()
      return this._inflight
    },

    _waitInflight() {
      // 简单轮询等待当前 inflight 完成
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this._inflight) {
            clearInterval(timer)
            resolve()
          }
        }, 50)
      })
    },

    /**
     * Mock 支付成功后, 用后端响应刷新 store
     * @param {string} orderId
     */
    async markPaid(orderId) {
      const res = await mockPayOrder({ order_id: orderId })
      // 后端返回的 { order, subscription: { plan_type, expires_at, entitlements, ... } }
      if (res && res.subscription) {
        this.subscription = {
          plan_type: res.subscription.plan_type,
          expires_at: res.subscription.expires_at,
          started_at: res.subscription.started_at,
          source_order_id: res.subscription.source_order_id,
        }
        this.effectivePlanType = res.subscription.plan_type
        this.entitlements = res.subscription.entitlements || defaultEntitlements()
        this.loaded = true
        this.error = null
      }
      return res
    },

    clear() {
      this.subscription = null
      this.effectivePlanType = 'free'
      this.entitlements = defaultEntitlements()
      this.serverNow = 0
      this.loading = false
      this.error = null
      this.loaded = false
      this._inflight = null
    },
  },
})
