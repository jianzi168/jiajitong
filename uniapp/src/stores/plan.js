/**
 * 当前方案 Pinia Store（Phase 7 引入）
 *
 * 单一权威来源：activePlan / activated / dashboard 快照。
 * 取代 home / dashboard 各自硬拉的临时通道。
 *
 * 数据来源：services/api（Phase 7 新入口）
 */

import { defineStore } from 'pinia'
import { getActivePlan, activatePlan, getDashboard } from '@/services/api'

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
        this.error = e.message || String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async activate() {
      this.loading = true
      this.error = null
      try {
        const res = await activatePlan({})
        this.activePlan = res.plan
        this.activated = true
        return this.activePlan
      } catch (e) {
        this.error = e.message || String(e)
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
        if (res.plan) this.activePlan = res.plan
        return res
      } catch (e) {
        this.error = e.message || String(e)
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