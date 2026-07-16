# Phase 4：完整测算向导 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 5 步向导（subpackages/wizard/step1-5）+ 报告预览页（subpackages/report/preview）打通真实数据流，目标 M3 里程碑：从 quick 完成 → 走完 5 步 → 看到完整规划书预览。

**Architecture:** Pinia `wizardStore` 持有向导状态；step1-5 通过 `store.$patch` 步进更新；step5 调 `engineClient.callCalcFull(wizardStore.payload)` 拿结果，跳 preview。Free 状态下 preview 部分内容用 blur 遮罩 + 付费 CTA 引导。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + UniApp + 已有的 engineClient。零新依赖。

---

## 关联文档

- PDD §5.2（5 步字段）、§5.3（报告 7 块结构 + 免费/付费权益）
- 技术方案 §6.4（向导实现）、§6.5（报告权益控制）
- 开发计划 Phase 4 章节

---

## Global Constraints

- Pinia store 单一持有向导状态；step 间通过 store 通信，**不用 URL query**（区别于 quick）
- 向导状态可被 quick 结果预填（loadFromQuick），来源是 quick/result.vue 跳 wizard/step1 时
- 备育分支：`stage ∈ (planning, pregnant)` 时 step4 显示备育模块
- 收支失衡：step3 实时显示占比，≥90% 时禁用「下一步」并提示跳 error-imbalance
- Free 权益：完整 7 类预算只显示 2 类 + 1 条建议 + 摘要级备育；其余 blur 引导付费（Phase 8 接入真实支付，本期是占位）
- 不实现 calc_sessions / Joi schema / plan.save —— 留给 Phase 6/9
- 不做 step 间返回数据丢失校验（pinia state 持有即可）

---

### Task 1: wizardStore (Pinia)

**Files:**
- Create: `uniapp/src/stores/wizard.js`

**Interface:**
```javascript
// state
stage: ''                // 'newlywed' | 'planning' | 'pregnant' | ''
planDate: null           // 'YYYY-MM' for planning/pregnant
city: ''
monthlyIncome: 0
incomeStability: 'stable' // 'stable' | 'bonus' | 'volatile'
fixedExpenses: {         // 多类目
  housing: 0,
  loan: 0,
  insurance: 0,
  support: 0,
  other: 0,
}
savingsTarget: 0
emergencyFund: 0         // 元
monthsToBaby: null       // 仅备育
currentBabyReserve: 0    // 仅备育

// getters
fixedTotal: number
fixedRatio: number       // fixedTotal / monthlyIncome
isImbalance: boolean     // ratio >= 0.9
isBabyStage: boolean     // stage === 'planning' || 'pregnant'
payload: object          // 喂给 calc.full 的输入
canSubmit: boolean       // 全部必填填了

// actions
loadFromQuick({ city, income, housing })
setStage(stage)
setPlanDate(date)
setCity(city)
setIncome(v)
setStability(s)
setFixed(key, value)
setSavingsTarget(v)
setEmergencyFund(v)
setBaby({ monthsToBaby, currentBabyReserve })
reset()
```

- [ ] **Step 1: 写 `stores/wizard.js`**

```javascript
import { defineStore } from 'pinia'

export const useWizardStore = defineStore('wizard', {
  state: () => ({
    stage: '',
    planDate: null,
    city: '',
    monthlyIncome: 0,
    incomeStability: 'stable',
    fixedExpenses: { housing: 0, loan: 0, insurance: 0, support: 0, other: 0 },
    savingsTarget: 0,
    emergencyFund: 0,
    monthsToBaby: null,
    currentBabyReserve: 0,
  }),
  getters: {
    fixedTotal: (s) => Object.values(s.fixedExpenses).reduce((a, b) => a + (Number(b) || 0), 0),
    fixedRatio() { return this.monthlyIncome > 0 ? this.fixedTotal / this.monthlyIncome : 0 },
    isImbalance() { return this.fixedRatio >= 0.9 },
    isBabyStage: (s) => s.stage === 'planning' || s.stage === 'pregnant',
    emergencyFundMonths() {
      // 备用金能覆盖几个月的固定支出
      const m = this.fixedTotal > 0 ? this.emergencyFund / this.fixedTotal : 0
      return Math.round(m * 10) / 10
    },
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
    canSubmit(state) {
      return state.city
        && state.monthlyIncome >= 1000
        && state.fixedExpenses.housing > 0
        && !this.isImbalance
        && (this.isBabyStage ? state.monthsToBaby != null : true)
    },
  },
  actions: {
    loadFromQuick({ city, income, housing }) {
      this.city = city
      this.monthlyIncome = income
      this.fixedExpenses.housing = housing
    },
    setStage(stage) {
      this.stage = stage
      // 切回 newlywed 清空备育字段
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
    setFixed(key, value) { this.fixedExpenses[key] = Number(value) || 0 },
    setSavingsTarget(v) { this.savingsTarget = Number(v) || 0 },
    setEmergencyFund(v) { this.emergencyFund = Number(v) || 0 },
    setBaby({ monthsToBaby, currentBabyReserve }) {
      this.monthsToBaby = monthsToBaby == null ? null : Number(monthsToBaby)
      this.currentBabyReserve = Number(currentBabyReserve) || 0
    },
    reset() { this.$reset() },
  },
})
```

- [ ] **Step 2: 验证 store 加载无错**

```bash
cd uniapp && node -e "
const { createPinia, setActivePinia } = require('pinia')
setActivePinia(createPinia())
" 2>&1 | head -5
```

期望：无报错（pinia 在 vue 上下文才报错，单独 require 不出错）。实际验证留到 step5 调用 calc.full 时做。

---

### Task 2: step1 — 家庭阶段

**Files:**
- Modify: `uniapp/src/subpackages/wizard/step1.vue`

**行为**：
- 三个 pick-card：新婚磨合期 / 备孕中 / 计划 N 年内生育
- 选「计划 N 年内生育」时弹出年份 picker（1/2/3 年）
- 「下一步」→ step2

- [ ] **Step 1: 写 step1.vue**

读 wizardStore，三卡片单选，点击设 stage + planDate（如果有）。禁用未选。

---

### Task 3: step2 — 城市与收入

**Files:**
- Modify: `uniapp/src/subpackages/wizard/step2.vue`

**行为**：
- 城市：复用 quick step1 的下拉（10 城 + "更多即将开放"），engineClient.callCitiesList()
- 收入：slider + input
- 稳定性：3 个 pill（稳定 / 含奖金 / 一方波动）
- 「下一步」→ step3

---

### Task 4: step3 — 固定开销

**Files:**
- Modify: `uniapp/src/subpackages/wizard/step3.vue` + `step3-warn.vue`（>50% 警告页，可跳回修改）

**行为**：
- 5 个类目：房贷/房租、车贷/停车、保险、赡养父母、其他固定
- 实时显示固定占比 + 颜色（绿/黄/红）
- ≥90% 时禁用「下一步」，显示「建议先梳理必选项」+ 跳 error-imbalance 入口
- 「下一步」→ step4

---

### Task 5: step4 — 储蓄与备育

**Files:**
- Modify: `uniapp/src/subpackages/wizard/step4.vue`

**行为**：
- 储蓄目标：slider（建议 income × 20%，可调）
- 应急金：input（元）
- **备育模块**（仅 isBabyStage）：
  - 计划生育日期：picker
  - 当前备育储备：input（元）
- 「下一步」→ step5

---

### Task 6: step5 — 确认生成

**Files:**
- Modify: `uniapp/src/subpackages/wizard/step5.vue` + `loading.vue`

**行为**：
- 显示只读汇总（收入/固定/储蓄/可支配/备育）
- 「生成我的家庭规划书」按钮
- 点击 → 跳 loading → 调 callCalcFull → 跳 report/preview

---

### Task 7: report/preview — 规划书预览

**Files:**
- Modify: `uniapp/src/subpackages/report/preview.vue`

**行为**：
- 7 块结构（PDD §5.3）：封面 / 收支总览 / 月度预算 / 备育专项 / 建议 / 风险报告 / 下一步
- **Free 状态**：7 类预算只显示 2 类，其余 blur + 「解锁完整报告」CTA
- 完整分仅 1 条建议 + 摘要备育
- 顶部健康分环（ScoreRing）+ 评级 pill

---

### Task 8: 从 quick 进入向导

**Files:**
- Modify: `uniapp/src/pages/quick/result.vue`「登录看完整规划书」按钮
- Add: `uniapp/src/stores/wizard.js` 已创建（Task 1）

**行为**：
- result 页"登录看完整规划书"按钮 → `wizardStore.loadFromQuick({city, income, housing})` + navigateTo `/subpackages/wizard/step1`

---

### Task 9: 编译验证 + 真机扫码

**Files:**
- 无新文件

- [ ] **Step 1: 编译**

```bash
cd uniapp && npm run dev:mp-weixin
```

期望：DONE Build complete，无错误。

- [ ] **Step 2: 真机走 5 步**

quick step1→2→3→result → "登录看完整规划书" → wizard step1 选 stage → step2 → step3 → step4 → step5 → preview

期望：preview 页显示真实算出来的 health_score / 7 类预算 / baby_reserve。

---

### Task 10: commit + merge

**Files:**
- All above

- [ ] **Step 1: commit + push**

```bash
git add uniapp/src/stores/ uniapp/src/subpackages/ uniapp/src/pages/quick/result.vue
git commit -m "feat(wizard): Phase 4 完整 5 步向导 + 报告预览 (M3)"
git push origin feature/phase-4-wizard
```

- [ ] **Step 2: merge 到 develop**

```bash
git checkout develop
git merge --no-ff feature/phase-4-wizard
git push origin develop
```

---

## 验收清单（M3 完成）

- [ ] 5 步均可前进/后退，数据不丢（Pinia 持有）
- [ ] 备育用户 Step 4 出现储备模块
- [ ] 生成动画 ≤2s 后进入报告预览
- [ ] 从快测结果页进入向导时预填 city/income/housing
- [ ] Free 状态：2 类预算可见 + 1 条建议 + 摘要备育 + 5 类 blur
- [ ] 收支失衡在 step3 即时拦截（禁用下一步 + 提示）

---

## 不做清单

- ❌ R01–R07 规则引擎 → Phase 5
- ❌ calc_sessions 持久化 → Phase 6
- ❌ 真实付费解锁 → Phase 8
- ❌ PDF 导出 / 分享长图 → Phase 8
- ❌ plan.save → Phase 6

---

**文档结束**