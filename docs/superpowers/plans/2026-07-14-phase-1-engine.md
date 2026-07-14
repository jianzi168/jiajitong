# Phase 1：测算引擎 + 基准数据 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `cloudfunctions/common/engine`（测算引擎）与 `cloudfunctions/common/benchmark-data`（基准数据），产出可被云函数 `api` 网关与本地 `scripts/test-engine.js` 共享调用的纯函数集。验收：≥20 单测全绿、10 城 <50ms、覆盖率 ≥85%、JSON Schema 校验通过。

**Architecture:** 引擎为 CommonJS 纯函数模块，单一来源 = `uniapp/cloudfunctions/common/engine/`。基准数据为内置 JSON（10 城 × 7 大类人均月消费 + 备育首年增量），无读库依赖。计算按 PDD §6.2 公式实现：`类目基准 = 城市人均 × 家庭系数 × 城市等级系数 × 收入系数`，最终归一化到 `可支配收入 × 0.95`。

**Tech Stack:** Node.js ≥18（用内置 `node:test` + `node:assert`，不引第三方测试框架）；CommonJS（与云函数运行时一致）；无 npm 依赖。

---

## 关联文档（实施前必读）

- PDD §6.1 输出 schema、§6.2 公式、§6.3 异常处理、§附录 A 7 大类、§附录 B 10 城
- 技术方案 §3 工程结构、§5.5 网关骨架、§7 引擎模块划分、§0.3 路径与命名
- 开发计划 Phase 1 章节（验收用例表）

---

## Global Constraints

- 引擎单一来源 = `uniapp/cloudfunctions/common/engine/`，**禁止**复制到 `scripts/` 或客户端。
- 引擎模块为 **CommonJS**（云函数运行时一致），不用 ESM。
- 单测入口 = `scripts/test-engine.js`，通过 `require('../uniapp/cloudfunctions/common/engine')` 共享同一份源码。
- 单测用 Node 内置 `node:test` + `node:assert`，不引外部依赖。
- 输出 JSON 严格遵循 PDD §6.1 schema（health_score/risk_level/monthly_summary/categories/baby_reserve/recommendations/risk_report）。
- 不接 `wx.cloud`、不连 DB —— 引擎纯函数、零副作用。
- 数值精度：所有金额取整到元（`Math.round`），百分比保留 4 位小数。
- 不实现 R01–R07 / R-N01–N07 规则引擎（Phase 5 任务），但 `recommendations` 字段在 `calcFull` 输出里要预留空数组 `[]` 占位。
- 备育基准的「城市等级」只区分一线 / 新一线两档（一线：上海/北京/深圳/广州；新一线：其他 6 城）。

---

### Task 1: 建 benchmark-data 模块（10 城 + 备育增量）

**Files:**
- Create: `uniapp/cloudfunctions/common/benchmark-data/index.js`
- Create: `uniapp/cloudfunctions/common/benchmark-data/cities.js`
- Create: `uniapp/cloudfunctions/common/benchmark-data/category-benchmarks.js`
- Create: `uniapp/cloudfunctions/common/benchmark-data/baby-benchmarks.js`

**Interfaces:**
- `cities`: `[{ name, tier, medianIncome }]` —— 10 城，每城 `{ name, tier: 'tier1'|'tier2', medianIncome }`
- `categoryBenchmarks`: `[{ category, perCapitaMonthly, tier1Multiplier, tier2Multiplier }]` —— 7 大类（food/daily/entertainment/medical/clothing/transport/other），每人月均基准 + 城市等级系数
- `babyBenchmarks`: `{ tier1: { milkDiapers, childcare, medical, supplies, oneTimeChildbirth }, tier2: {...} }`

**数据来源约定**（PDD §附录 B 10 城，金额单位：元/月/人）：

| 城市 | tier | medianIncome（家庭月收入中位数） |
|------|------|-------------------------------|
| 上海 / 北京 / 深圳 / 广州 | tier1 | 28000 |
| 杭州 / 成都 / 武汉 / 南京 / 苏州 / 西安 | tier2 | 20000 |

7 大类 perCapitaMonthly（人均月基准）：food 1500 / daily 600 / entertainment 800 / medical 500 / clothing 600 / transport 700 / other 400。tier1 ×1.0、tier2 ×0.85。

备育首年增量（首年月均 / 一次性）：tier1 = { milkDiapers: 1800, childcare: 3500, medical: 600, supplies: 500, oneTimeChildbirth: 15000 }；tier2 = { milkDiapers: 1500, childcare: 2800, medical: 500, supplies: 400, oneTimeChildbirth: 12000 }。

- [ ] **Step 1: 创建目录**

```bash
mkdir -p uniapp/cloudfunctions/common/benchmark-data
```

- [ ] **Step 2: 写 `cities.js`**

10 城数组。`module.exports = [...]`。

- [ ] **Step 3: 写 `category-benchmarks.js`**

7 大类数组。`module.exports = [...]`。

- [ ] **Step 4: 写 `baby-benchmarks.js`**

tier1/tier2 两档对象。`module.exports = { tier1: {...}, tier2: {...} }`。

- [ ] **Step 5: 写 `index.js` 总入口**

聚合以上三个文件并导出：`module.exports = { cities, categoryBenchmarks, babyBenchmarks, getCityByName, getBenchmarkByCategory, getBabyBenchmarkByTier }`。

- [ ] **Step 6: 校验 node 加载无语法错误**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2
node -e "console.log(Object.keys(require('./uniapp/cloudfunctions/common/benchmark-data')))"
```

期望输出：`[ 'cities', 'categoryBenchmarks', 'babyBenchmarks', 'getCityByName', 'getBenchmarkByCategory', 'getBabyBenchmarkByTier' ]`

---

### Task 2: 建 engine 常量与归一化工具

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/constants.js`
- Create: `uniapp/cloudfunctions/common/engine/normalize.js`

**Interfaces:**
- `constants.js`: 导出 `CATEGORY_IDS`（7 大类 ID 数组）、`STAGE_COEFFICIENTS`（{ newlywed:1.0, planning:1.05, pregnant:1.08 }）、`INCOME_COEFF_MIN/MAX`（0.85/1.15）、`IMBALANCE_RATIO`（0.9）、`BABY_TOO_SOON_MONTHS`（6）、`FAMILY_CONSUMPTION_COEFF`（1.8）。
- `normalize.js`: 导出 `normalizeCategories(rawCategories, disposableIncome)` —— 把各类目基准值归一化使合计 = `disposableIncome × 0.95`，并产出 `{ suggested, range_min: suggested*0.75, range_max: suggested*1.25 }`。

- [ ] **Step 1: 写 `constants.js`**

```javascript
module.exports = {
  CATEGORY_IDS: ['food','daily','entertainment','medical','clothing','transport','other'],
  STAGE_COEFFICIENTS: { newlywed: 1.0, planning: 1.05, pregnant: 1.08 },
  INCOME_COEFF_MIN: 0.85,
  INCOME_COEFF_MAX: 1.15,
  IMBALANCE_RATIO: 0.9,
  BABY_TOO_SOON_MONTHS: 6,
  FAMILY_CONSUMPTION_COEFF: 1.8,
}
```

- [ ] **Step 2: 写 `normalize.js`**

输入 `rawCategories` 是 `[{ id, baseValue }]`，输出 `[{ id, name, suggested, range_min, range_max, ratio, calculation_basis }]`。
- `ratio = baseValue / sum(baseValues)`
- `suggested = Math.round(disposableIncome * 0.95 * ratio)`
- `range_min = Math.round(suggested * 0.75)`
- `range_max = Math.round(suggested * 1.25)`
- `calculation_basis = '基准 X × 家庭系数 × 城市系数 × 收入系数'`

- [ ] **Step 3: 校验**

```bash
node -e "const n=require('./uniapp/cloudfunctions/common/engine/normalize'); console.log(n.normalizeCategories([{id:'food',baseValue:3000},{id:'daily',baseValue:1200}],12000).map(c=>c.suggested))"
```

期望：`[ 8550, 3420 ]`（合计 11970 ≈ 12000×0.95）

---

### Task 3: 实现 errors 模块

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/errors.js`

**Interfaces:**
- `BizError`: 自定义错误类，字段 `{ code, message, userHint, details }`
- `bizError(code, message, userHint, details)`: 工厂函数
- `detectImbalance(fixedExpense, income)`: 固定支出 ≥ 收入 × 0.9 时抛 `BizError(40001, 'IMBALANCE', '固定支出占比过高，建议先梳理必选项')`
- `detectCityNotCovered(city, cities)`: 城市不在 cities 时返回 fallback 城市名（tier2 中位数），并带 `city_estimated: true` 标记（不抛错）
- `detectBabyTooSoon(monthsRemaining, currentReserve, required)`: monthsRemaining < 6 且 currentReserve < required 时返回 warning 对象 `{ code: 'BABY_TOO_SOON', severity: 'red' }`（不抛错）

错误码表（PDD §6.3 + 技术方案 §5.4）：
- 40001 IMBALANCE
- 40002 CITY_NOT_COVERED（不阻断，用 fallback）
- 40003 BABY_TOO_SOON（不阻断，下钻到 risk_report）

- [ ] **Step 1: 写 `errors.js`**

实现 BizError 类 + 三个 detect 函数。detectImbalance 抛错，detectCityNotCovered / detectBabyTooSoon 返回对象。

- [ ] **Step 2: 校验**

```bash
node -e "
const {BizError,detectImbalance} = require('./uniapp/cloudfunctions/common/engine/errors');
try { detectImbalance(29000, 30000) } catch(e) { console.log(e.code, e.message) }
"
```

期望：`40001 IMBALANCE`

---

### Task 4: 实现 calcHealthScore（PDD §6.2.3 四维权重）

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/calcHealthScore.js`

**Interfaces:**
- 输入：`{ income, fixedExpense, savingsTarget, emergencyFundMonths, disposable }`
- 输出：`{ score: 0-100, riskLevel: 'green'|'yellow'|'red', dimensions: { savingsRate, fixedRatio, emergencyMonths, structureReasonable } }`

**四维评分逻辑**（PDD §6.2.3）：

| 维度 | 权重 | 满分条件 | 线性区间 | 低分条件 |
|------|------|----------|----------|----------|
| 储蓄率 (savings/income) | 30% | ≥ 20% | 10–20% → 线性 | < 10% |
| 固定支出占比 (fixed/income) | 25% | ≤ 40% | 40–50% → 中 | > 50% |
| 备用金月数 | 25% | ≥ 6 月 | 3–6 → 中 | < 3 |
| 预算结构合理性 | 20% | always pass MVP | — | — |

`score = round(savingsRateScore*0.3 + fixedRatioScore*0.25 + emergencyScore*0.25 + structureScore*0.20)`

`riskLevel`（PDD §6.2.3）：
- 🟢 score ≥ 75 && emergencyMonths ≥ 3
- 🟡 score 50–74 || fixedRatio 0.45–0.55
- 🔴 score < 50 || fixedRatio > 0.55 || emergencyMonths < 1

- [ ] **Step 1: 写 `calcHealthScore.js`**

实现评分函数。

- [ ] **Step 2: 校验**

```bash
node -e "
const f=require('./uniapp/cloudfunctions/common/engine/calcHealthScore');
console.log(f({income:32000,fixedExpense:13500,savingsTarget:6400,emergencyFundMonths:6,disposable:12100}))
"
```

期望：`{ score: 75+, riskLevel: 'green' }`（储蓄率 20% / 固定 42% / 备用 6月）

---

### Task 5: 实现 calcBabyReserve（PDD §6.2.4）

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/calcBabyReserve.js`

**Interfaces:**
- 输入：`{ stage, cityTier, monthsRemaining, currentReserve }`
- 输出：`{ target, current, monthlyRequired, monthsRemaining, pressureRatio }`
- `target = (monthlyIncrement * 12) + oneTimeChildbirth + disposable*6`（6 个月生活缓冲）
- `monthlyRequired = max(0, round((target - current) / monthsRemaining))`
- `pressureRatio = monthlyRequired + savingsTarget / (disposable * 0.3)` —— 用于 R-N01 触发判断

- [ ] **Step 1: 写 `calcBabyReserve.js`**

输入不含 `disposable`，函数内根据 `cityTier` 查 `babyBenchmarks` 算出月增量与一次性，再产出对象。如 `monthsRemaining <= 0`，返回 `{ target: 0, monthlyRequired: 0 }`。

- [ ] **Step 2: 校验**

```bash
node -e "
const f=require('./uniapp/cloudfunctions/common/engine/calcBabyReserve');
console.log(f({stage:'planning',cityTier:'tier1',monthsRemaining:12,currentReserve:32000}))
"
```

期望：`target` 在 80000 左右（增量月 6400×12=76800 + 一次性 15000 + 缓冲 72000... 太高了，调整 baseline）

> ⚠️ 注意 baseline 数字要调教：MVP 用 `monthlyIncrement*12 + oneTimeChildbirth` 即可，缓冲留给 P1。第一轮 target 期望 ≈ 76800+15000=91800 → monthlyRequired = (91800-32000)/12 ≈ 4983。

---

### Task 6: 实现 calcQuick（PDD §6.1 输出 schema 简化版）

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/calcQuick.js`

**Interfaces:**
- 输入：`{ city, income, housing }`（housing 计入 fixed）
- 输出：`{ health_score, risk_level, monthly_summary: { income, fixed_expense, disposable }, disposable_range: [min, max], top_recommendation, city_estimated: false, warnings: [] }`
- 行为：
  1. `city` 不在 `cities` → 用 tier2 fallback，置 `city_estimated: true`
  2. `housing / income ≥ 0.9` → 抛 IMBALANCE
  3. 可支配 = income - housing（简化快测，savingsTarget 暂取 income × 20%）
  4. `disposable_range = [round(disposable*0.8), round(disposable*1.2)]`
  5. `top_recommendation` 硬编码一条："餐饮可适当压缩，每月可省 ¥300-500"（MVP 占位，规则引擎 Phase 5 替换）
  6. `health_score` 用 `calcHealthScore` 计算（仅 3 维：储蓄率/固定/备用金用 3 月默认）

- [ ] **Step 1: 写 `calcQuick.js`**

实现函数，依赖 `errors.js`、`calcHealthScore.js`、`benchmark-data/index.js`。

- [ ] **Step 2: 校验**

```bash
node -e "
const f=require('./uniapp/cloudfunctions/common/engine/calcQuick');
console.log(f({city:'上海',income:32000,housing:11000}))
"
```

期望：`health_score` 在 70-85，`disposable_range` 合理，`city_estimated: false`

---

### Task 7: 实现 calcFull（PDD §6.1 完整 plan）

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/calcFull.js`

**Interfaces:**
- 输入：`{ stage, city, monthlyIncome, incomeStability, fixedExpenses: { housing, loan, insurance, ... }, savingsTarget, emergencyFundMonths, monthsToBaby?, currentBabyReserve? }`
- 输出：`{ plan_id: <uuid>, health_score, risk_level, monthly_summary, categories[], baby_reserve, recommendations: [], risk_report }`
- 行为：
  1. `city` 校验（fallback 处理）
  2. `fixedExpenses` 求和 → IMBALANCE 校验
  3. `monthly_summary` 计算：`{ income, fixed_expense, savings_target, disposable }`
  4. 类目基准计算：每个 city × category → `perCapita * familyCoeff(1.8) * tierMult * incomeCoeff * stageCoeff`
  5. `normalizeCategories` 归一化
  6. `calcHealthScore` 算分
  7. 备育分支：`stage ∈ (planning, pregnant)` → 调 `calcBabyReserve`，否则 `baby_reserve: null`
  8. `risk_report` 聚合 IMBALANCE / BABY_TOO_SOON 等警告
  9. `recommendations: []`（Phase 5 接入 R01–R07 + R-N01–N07）
  10. `plan_id` 用 `crypto.randomUUID()`（Node 14.17+ 内置）

- [ ] **Step 1: 写 `calcFull.js`**

按上述步骤实现。

- [ ] **Step 2: 校验**

```bash
node -e "
const f=require('./uniapp/cloudfunctions/common/engine/calcFull');
console.log(JSON.stringify(f({
  stage:'planning', city:'上海', monthlyIncome:32000, incomeStability:'stable',
  fixedExpenses:{ housing:11000, loan:1500, insurance:1000 },
  savingsTarget:6400, emergencyFundMonths:6, monthsToBaby:12, currentBabyReserve:32000
}), null, 2))
"
```

期望：完整 plan JSON 含 7 个 categories、baby_reserve、risk_report。

---

### Task 8: 实现 engine index 入口

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/index.js`

**Interfaces:**
- 导出 `{ calcQuick, calcFull, calcHealthScore, calcBabyReserve, normalize, constants, errors, benchmark }`
- benchmark re-export 自 `../benchmark-data`

- [ ] **Step 1: 写 `index.js`**

```javascript
const { calcQuick } = require('./calcQuick')
const { calcFull } = require('./calcFull')
const { calcHealthScore } = require('./calcHealthScore')
const { calcBabyReserve } = require('./calcBabyReserve')
const normalize = require('./normalize')
const constants = require('./constants')
const errors = require('./errors')
const benchmark = require('../benchmark-data')

module.exports = {
  calcQuick, calcFull, calcHealthScore, calcBabyReserve,
  normalize, constants, errors, benchmark,
}
```

- [ ] **Step 2: 校验入口聚合**

```bash
node -e "const e=require('./uniapp/cloudfunctions/common/engine'); console.log(Object.keys(e))"
```

期望：`[ 'calcQuick', 'calcFull', 'calcHealthScore', 'calcBabyReserve', 'normalize', 'constants', 'errors', 'benchmark' ]`

---

### Task 9: 写 ≥20 条单测（scripts/test-engine.js）

**Files:**
- Create: `scripts/test-engine.js`

**测试用例分布**（PDD §三 Phase 1 要求 ≥20，开发计划列了 6 类）：

| # | 类别 | 用例 |
|---|------|------|
| 1 | 基准 | 上海 32000/11000 → disposable_range 合理 |
| 2 | 基准 | 北京 28000/9000 → 略低于上海 |
| 3 | 阶段系数 | 备孕 vs 新婚 → 备孕 medical 类上浮 |
| 4 | 健康分 | 储蓄 20%/固定 45%/备用 6月 → ≥75 |
| 5 | 健康分 | 储蓄 5%/固定 60%/备用 1月 → <60 红 |
| 6 | 边界 | 固定 89% → 通过 |
| 7 | 边界 | 固定 91% → IMBALANCE |
| 8 | 边界 | 固定 100% → IMBALANCE |
| 9 | 城市 | 未覆盖「厦门」→ tier2 fallback + city_estimated: true |
| 10 | 城市 | 上海 → city_estimated: false |
| 11 | 备育 | 12 月后生育 / 储备 32000 → 触发 R-N01 条件 |
| 12 | 备育 | 18 月后生育 / 储备 80000 → 不触发 |
| 13 | 备育 | 4 月后生育 / 储备 5000 → BABY_TOO_SOON warning |
| 14 | calcFull | 新婚 + 上海 → baby_reserve: null |
| 15 | calcFull | 备育 + 上海 → baby_reserve 完整对象 |
| 16 | calcFull | 7 个 categories 必有 |
| 17 | calcFull | categories 合计 ≈ disposable × 0.95 |
| 18 | calcQuick | 5 步字段子集跑通 |
| 19 | calcQuick | IMBALANCE 抛错 |
| 20 | calcQuick | 城市 fallback 不抛错 |
| 21 | 性能 | 10 城 × 1000 次调用 < 50s（10 城平均 <50ms） |
| 22 | 归一化 | disposable=0 → 边界不崩 |
| 23 | 收入系数 | 收入 5x 中位数 → clamp 1.15 |
| 24 | 收入系数 | 收入 0.5x 中位数 → clamp 0.85 |

- [ ] **Step 1: 写 `scripts/test-engine.js`**

用 `node:test` describe/it 风格，引入引擎，run 24 用例。

- [ ] **Step 2: 跑测验证全绿**

```bash
node --test scripts/test-engine.js
```

期望：`# tests 24 / # pass 24 / # fail 0`，耗时 < 5s。

---

### Task 10: package.json 加 test 脚本

**Files:**
- Modify: `uniapp/package.json`

- [ ] **Step 1: 在 scripts 加 test**

```json
"scripts": {
  "dev:mp-weixin": "uni -p mp-weixin",
  "build:mp-weixin": "uni build -p mp-weixin",
  "test": "node --test scripts/test-engine.js"
}
```

- [ ] **Step 2: 跑 npm test**

```bash
cd uniapp && npm test
```

期望：24/24 通过。

- [ ] **Step 3: 性能门禁（手动）**

```bash
node -e "
const e=require('./uniapp/cloudfunctions/common/engine');
const cities=e.benchmark.cities.map(c=>c.name);
const t0=Date.now();
for(let i=0;i<1000;i++) for(const c of cities) e.calcQuick({city:c,income:28000,housing:9000});
console.log('avg ms/call:', (Date.now()-t0)/10000);
"
```

期望：< 50ms（10000 次 / <500s）。

---

### Task 11: 写 JSON Schema + 校验

**Files:**
- Create: `uniapp/cloudfunctions/common/engine/__schema__/plan.schema.json`

- [ ] **Step 1: 写 PDD §6.1 schema**

参考 PDD §6.1 输出结构，字段严格对齐（plan_id / health_score / risk_level / monthly_summary / categories / baby_reserve / recommendations / risk_report）。

- [ ] **Step 2: 写 `scripts/validate-plan.js`**

读 schema + 跑 5 个 fixture 输入 `calcFull`，用 `ajv`（npm i ajv）校验全过。

> ⚠️ ajv 是 npm 依赖，需先 `npm i -D ajv`。这一步可推迟到 Phase 2（API 层），Phase 1 只要求 fixture 字段匹配即可，本步骤降级为可选。

- [ ] **Step 3:（可选）跑校验**

```bash
node scripts/validate-plan.js
```

---

### Task 12: commit + push

**Files:**
- Modify: `uniapp/cloudfunctions/common/benchmark-data/` (new)
- Modify: `uniapp/cloudfunctions/common/engine/` (new)
- Modify: `scripts/test-engine.js` (new)
- Modify: `uniapp/package.json` (test script)

- [ ] **Step 1: git add + commit**

```bash
git add uniapp/cloudfunctions/ scripts/test-engine.js uniapp/package.json
git commit -m "feat(engine): Phase 1 测算引擎 + 10 城基准 + 24 单测

- common/benchmark-data: 10 城 × 7 大类人均月消费 + 备育首年增量
- common/engine: calcQuick/calcFull/healthScore/babyReserve 纯函数
- 异常检测: IMBALANCE 抛错 / CITY_NOT_COVERED fallback / BABY_TOO_SOON warning
- scripts/test-engine.js: 24 用例覆盖基准/阶段/健康分/边界/城市/备育/性能
- 验收: 单测 24/24 绿, 10 城平均 <50ms, 符合 PDD §6.1 输出 schema

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 2: 推送到远程 feature/phase-1-engine**

```bash
git push -u origin feature/phase-1-engine
```

- [ ] **Step 3: 在 GitHub 开 PR → develop**

---

## 验收清单（Phase 1 完成标准）

- [ ] `node --test scripts/test-engine.js` 输出 `# pass 24 / # fail 0`
- [ ] 10 城 × 1000 次 calcQuick 平均 < 50ms
- [ ] `calcFull` 输出 JSON 字段完全对齐 PDD §6.1 schema
- [ ] 4 个异常检测分支（IMBALANCE / CITY_NOT_COVERED / BABY_TOO_SOON）行为符合 PDD §6.3
- [ ] `uniapp/cloudfunctions/common/engine/` 与云函数 `api` 网关可 `require` 共用同一份源码
- [ ] PR 已合入 develop，下一步开 Phase 2（API 网关） feature/phase-2-api

---

## 不做清单（避免越界）

- ❌ R01–R07 / R-N01–N07 规则引擎 → Phase 5
- ❌ wx-server-sdk 接入 → Phase 2
- ❌ 云数据库读写 → Phase 6
- ❌ 微信支付 → Phase 8
- ❌ 前端 store / services 改造 → 引擎稳定后再做

---

**文档结束**