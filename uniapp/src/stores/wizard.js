/**
 * 向导 Pinia Store (技术方案 §3 stores/wizard.js + 开发计划 Phase 4)
 *
 * 持有 5 步向导全部状态，step1-5 通过此 store 通信（不依赖 URL query）。
 * 入口：quick/result.vue 的"登录看完整规划书"按钮调 loadFromQuick 预填。
 * 出口：wizard/step5 提交时读 payload 喂给 calc.full。
 */
import { defineStore } from 'pinia'

export const useWizardStore = defineStore('wizard', {
  state: () => ({
    // Step 1
    stage: '', // 'newlywed' | 'planning' | 'pregnant' | ''
    planDate: null, // 'YYYY-MM' for planning/pregnant
    // Step 2
    city: '',
    monthlyIncome: 0,
    incomeStability: 'stable', // 'stable' | 'bonus' | 'volatile'
    // Step 3
    fixedExpenses: {
      housing: 0,
      loan: 0,
      insurance: 0,
      support: 0,
      other: 0,
    },
    // Step 4
    savingsTarget: 0,
    emergencyFund: 0, // 元
    // Step 4 备育（仅 planning/pregnant）
    monthsToBaby: null, // 月数（距生育）
    currentBabyReserve: 0, // 元
  }),
  getters: {
    fixedTotal: (s) =>
      Object.values(s.fixedExpenses).reduce((a, b) => a + (Number(b) || 0), 0),
    fixedRatio(state) {
      return state.monthlyIncome > 0 ? this.fixedTotal / state.monthlyIncome : 0
    },
    isImbalance() {
      return this.fixedRatio >= 0.9
    },
    isBabyStage: (s) => s.stage === 'planning' || s.stage === 'pregnant',
    /** 应急金能覆盖几个月固定支出 */
    emergencyFundMonths(state) {
      if (this.fixedTotal <= 0) return 0
      const m = state.emergencyFund / this.fixedTotal
      return Math.round(m * 10) / 10
    },
    /** 喂给 engineClient.callCalcFull 的载荷 */
    payload(state) {
      const p = {
        stage: state.stage || 'newlywed',
        city: state.city,
        monthlyIncome: state.monthlyIncome,
        incomeStability: state.incomeStability,
        fixedExpenses: state.fixedExpenses,
        savingsTarget: state.savingsTarget,
        emergencyFundMonths: this.emergencyFundMonths,
      }
      if (this.isBabyStage) {
        p.monthsToBaby = state.monthsToBaby
        p.currentBabyReserve = state.currentBabyReserve
      }
      return p
    },
    /** 是否所有必填都已填、可以提交 */
    canSubmit(state) {
      if (!state.city || !state.stage) return false
      if (state.monthlyIncome < 1000) return false
      if (state.fixedExpenses.housing <= 0) return false
      if (this.isImbalance) return false
      if (this.isBabyStage && (state.monthsToBaby == null || state.monthsToBaby <= 0)) return false
      return true
    },
  },
  actions: {
    /** quick 结果页预填（来自 engineClient.callCalcQuick 的入参） */
    loadFromQuick({ city, income, housing }) {
      if (city) this.city = city
      if (income) this.monthlyIncome = Number(income) || 0
      if (housing != null) this.fixedExpenses.housing = Number(housing) || 0
    },
    setStage(stage) {
      this.stage = stage
      if (stage === 'newlywed') {
        this.monthsToBaby = null
        this.currentBabyReserve = 0
        this.planDate = null
      }
    },
    setPlanDate(date) { this.planDate = date },
    setCity(city) { this.city = city },
    setIncome(v) { this.monthlyIncome = Number(v) || 0 },
    setStability(s) { this.incomeStability = s },
    setFixed(key, value) {
      if (key in this.fixedExpenses) {
        this.fixedExpenses[key] = Number(value) || 0
      }
    },
    setSavingsTarget(v) { this.savingsTarget = Number(v) || 0 },
    setEmergencyFund(v) { this.emergencyFund = Number(v) || 0 },
    setBaby({ monthsToBaby, currentBabyReserve }) {
      if (monthsToBaby !== undefined) {
        this.monthsToBaby = monthsToBaby == null ? null : Number(monthsToBaby)
      }
      if (currentBabyReserve !== undefined) {
        this.currentBabyReserve = Number(currentBabyReserve) || 0
      }
    },
    reset() { this.$reset() },
  },
})