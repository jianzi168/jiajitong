/**
 * 当前方案 Pinia Store（Phase 7 引入）
 *
 * 单一权威来源：activePlan / activated / dashboard 快照。
 * 取代 home / dashboard 各自硬拉的临时通道。
 *
 * 数据来源：services/api（Phase 7 新入口）
 */

import { defineStore } from 'pinia'
import { getActivePlan, ensureAndActivate, getDashboard } from '@/services/api'

export const usePlanStore = defineStore('plan', {
  state: () => ({
    activePlan: null,
    activated: false,
    dashboard: null,
    loading: false,
    error: null,
  }),
  getters: {
    hasPlan: (s) => !!s.activePlan,
    healthScore: (s) => (s.activePlan && s.activePlan.health_score) || 0,
    monthlySummary: (s) => (s.activePlan && s.activePlan.monthly_summary) || null,
    babyReserve: (s) => (s.activePlan && s.activePlan.baby_reserve) || null,
    recommendations: (s) =>
      (s.activePlan && s.activePlan.recommendations) || [],
    /**
     * 本月储蓄进度（来自 dashboard.get）。
     * 未启用追踪时 actual 为 null —— 前端必须区分「0 元」与「无数据」，
     * 否则会把全部可支配收入谎报成已储蓄。
     */
    savings: (s) => (s.dashboard && s.dashboard.savings) || null,
  },
  actions: {
    async loadActive() {
      this.loading = true
      this.error = null
      try {
        const res = await getActivePlan()
        this.activePlan = res.plan || null
        this.activated = !!(this.activePlan && this.activePlan.activated_at)
        return this.activePlan
      } catch (e) {
        this.error = e.userHint || e.message || String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    /** @param {object|null} localPlan 报告页本地方案；无云端 plan 时会先 save */
    async activate(localPlan = null) {
      if (this.loading) return this.activePlan
      this.loading = true
      this.error = null
      try {
        const res = await ensureAndActivate(localPlan || this.activePlan)
        this.activePlan = res.plan || this.activePlan
        this.activated = true
        if (this.activePlan && !this.activePlan.activated_at) {
          this.activePlan = { ...this.activePlan, activated_at: Date.now() }
        }
        return this.activePlan
      } catch (e) {
        this.error = e.userHint || e.message || String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async loadDashboard() {
      this.loading = true
      this.error = null
      try {
        const res = await getDashboard()
        this.dashboard = res
        this.activated = !!res.activated
        // dashboard 始终带 plan 字段；无方案时清掉，避免旧缓存误判 hasPlan
        this.activePlan = res.plan || null
        return res
      } catch (e) {
        this.error = e.userHint || e.message || String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.activePlan = null
      this.activated = false
      this.dashboard = null
      this.error = null
    },
  },
})