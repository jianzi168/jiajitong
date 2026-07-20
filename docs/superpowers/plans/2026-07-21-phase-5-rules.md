# Phase 5：报告详细页 + 规则引擎 实现计划

**Goal:** 实现 R01–R07 + R-N01–N07 规则引擎，calcFull 输出真实 recommendations（不再空 []），report/preview 显示规则建议、report/full 展示完整版 + 行动采纳（localStorage 占位）。

**Architecture:** 规则引擎为纯函数，与引擎同一目录 `common/engine/rules/`，每条规则独立文件（r01-r07.js / rn01-rn07.js）。`rules/index.js` 聚合，输入 plan + input，输出排序后的 Top 5 recommendations。

**Tech Stack:** CommonJS 纯函数（与现有引擎一致），Node 内置 `node:test` 单测。

---

## 关联文档

- PDD §7.1–7.3（R01-R07 / R-N01-N07 / 排序公式）
- 技术方案 §7 / §3 (rules 目录约定)
- 开发计划 Phase 5 / W4

---

## Global Constraints

- 单条规则输出格式：`{ id, title, severity, impact, feasibility, stage_weight, description, actions: [str], estimatedImpact, category }`
- 排序：`score = impact * feasibility * stage_weight`，降序，Top 5
- 影响金额 = 该建议实施后用户每月可省下的金额（用于预估）
- 可执行性 = 0.5 / 0.75 / 1.0（难 / 中 / 易）
- 阶段权重：备育规则 1.2，其他 1.0
- 不实现"采纳状态"持久化（Phase 9 接 DB）

---

### Task 1: R01-R07 通用规则

**Files:**
- Create: `cloudfunctions/api/common/engine/rules/r01-r07.js`

**Trigger 阈值**（楔子版）：
| ID | 触发 | 影响金额估算 |
|----|------|-------------|
| R01 储蓄率不足 | savings_rate < 20% | 缺 20% 部分的储蓄 |
| R02 固定占比高 | fixed_ratio > 50% | 推荐降至 40% 的差额 |
| R03 应急金不足 | emergency_fund_months < 3 | 缺到 3 月的差额 |
| R04 餐饮偏差 | food > food.range_max | food - range_max |
| R05 娱乐偏差 | entertainment > entertainment.range_max | entertainment - range_max |
| R06 医疗预算不足 | medical < medical.range_min | range_min - medical |
| R07 备用金过剩 | emergency_fund_months > 12 | 建议投资额 |

---

### Task 2: R-N01-N07 备育规则

**Files:**
- Create: `cloudfunctions/api/common/engine/rules/rn01-rn07.js`

**Trigger:**
- R-N01: monthly_required + savings_target > disposable * 0.30
- R-N02: (food + entertainment) > (food.range_max + entertainment.range_max) * 1.10
- R-N03: savings_rate < 0.15 && isBabyStage
- R-N04: housing / monthlyIncome > 0.45
- R-N05: emergencyFundMonths < 3 && isBabyStage
- R-N06: medical < medical.range_min && isBabyStage
- R-N07: 伴侣模式（MVP stub：family 单人时返回 null，不触发）

---

### Task 3: rules 聚合器

**Files:**
- Create: `cloudfunctions/api/common/engine/rules/index.js`
- Modify: `cloudfunctions/api/common/engine/index.js` (export rules)

**Interface:**
```javascript
function evaluateRules(plan, input) {
  const all = [...R_GENERAL, ...R_BABY]
  const triggered = all.filter(r => r.condition(plan, input))
  return triggered
    .map(r => ({ ...r, score: r.impact * r.feasibility * r.stage_weight(plan, input) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}
```

---

### Task 4: calcFull 集成

**Files:**
- Modify: `cloudfunctions/api/common/engine/calcFull.js`

**调用：** `recommendations = rules.evaluate(plan, input)`

---

### Task 5: rules 单测

**Files:**
- Create: `scripts/test-rules.js`

**≥10 用例：**
- 储蓄率 < 20% → R01
- 固定 60% → R02
- 应急金 1 月 → R03
- food 超上限 → R04
- 备育 + 储备月需 > 30% → R-N01
- 备育 + 储蓄 < 15% → R-N03
- 备育 + 房贷 > 45% → R-N04
- 备育 + 应急金 < 3 月 → R-N05
- 普通新婚 + R-N05 → 不触发
- 排序：impact 大的优先

---

### Task 6: report/full.vue

**Files:**
- Modify: `subpackages/report/full.vue`

**行为：** 完整 7 块 + 推荐建议（按等级排序）+ 采纳/稍后/忽略按钮（写 localStorage 占位）

---

### Task 7: preview 接 recommendations

**Files:**
- Modify: `subpackages/report/preview.vue`

**行为：**
- 显示真实 recommendations（不再 hard-code）
- "解锁完整版"按钮跳 full 页
- 蓝/黄/红按 severity 染色

---

### Task 8: 编译 + 真机

```bash
cd uniapp && npm run dev:mp-weixin
```

真机扫 → 看到真实建议 → 点跳 full。

---

### Task 9: commit + merge

```bash
git add -A
git commit -m "feat(rules): Phase 5 规则引擎 + 报告完整页 (M4)"
git push origin feature/phase-5-rules
git checkout develop
git merge --no-ff feature/phase-5-rules
git push origin develop
```

---

## 验收清单 (M4)

- [ ] calcFull 输出 recommendations 非空数组（≥3 条建议）
- [ ] 至少 3 个 fixture 家庭触发不同 R-N 规则
- [ ] report/preview 显示真实建议（不再是"顶部 1 条小建议"）
- [ ] report/full 显示完整 5 条 Top + 采纳按钮
- [ ] 报告 7 块结构与 PDD §5.3 一致
- [ ] rules/ 单测 ≥ 10 全绿

---

**文档结束**