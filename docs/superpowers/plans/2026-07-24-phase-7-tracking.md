# Phase 7 预算追踪闭环(M6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「启用预算追踪 → 周度填报 → 看板反映真实进度」闭环,达成里程碑 M6。

**Architecture:** 在已落地的 Phase 6(报告持久化到 `budget_plans`)基础上,新增 `weekly_entries` 集合与 6 个云函数 action,前端用 ISO 周一/自然月聚合规则汇总到 dashboard。`is_active` 继续表示「当前版本」,新增 `activated_at` 标记「已启用追踪」,与 Phase 6 兼容零回归。前端调用层从 `utils/engineClient.js` 统一迁入 `services/api.js`,新增 `stores/plan.js` 集中管理当前 plan / 激活态 / 看板快照。

**Tech Stack:** 微信云开发(云函数 Node.js + 云数据库)· UniApp + Vue 3 Composition API · Pinia · 引擎内 7 类固定分类(food/daily/entertainment/medical/clothing/transport/other)

**Spec:** `docs/superpowers/specs/2026-07-23-phase-7-budget-tracking-design.md`

## Global Constraints

- 周边界:ISO 周一为周起点,自然月聚合到看板
- 7 类固定 id:`food / daily / entertainment / medical / clothing / transport / other`(来源 `cloudfunctions/api/common/engine/constants.js:5-7`)
- `week_start` 格式 `YYYY-MM-DD`,`week_end = week_start + 6 days`
- 唯一联合索引:`family_id + week_start`(同周 upsert 覆盖,测试 T7-2)
- `family_id` 始终从当前 user 推导,**不信任前端传入**
- 鉴权统一走 `cloudfunctions/api/common/auth.js` 的 `requireUser/requireOwner/requireFamilyMember`
- 提交 commit 信息结尾追加 `Co-Authored-By: Claude <noreply@anthropic.com>`
- 测试脚本模式参照 `scripts/test-engine.js / test-auth.js / test-rules.js`(Node 脚本,直接 `node scripts/test-tracking.js`)
- 分支:`feature/phase-7-tracking`(已基于 develop 创建,spec 已提交)

---

## Task 1: DB 集合与索引 provisioning

**Files:**
- Modify: `scripts/create-collections.js`
- Modify: `scripts/check-indexes.js`(校验 weekly_entries 唯一索引)
- Test: `node scripts/check-indexes.js` 跑通

**Interfaces:**
- Consumes:Phase 6 已落地的 4 个集合(users / families / financial_profiles / budget_plans)
- Produces:`weekly_entries` 集合 + 唯一索引 `family_id+week_start`,`create-collections.js` 真正创建(修 `safeCreateIndex` opts bug)

- [ ] **Step 1: 复现 `safeCreateIndex` 的 opts bug**

打开 `scripts/create-collections.js:55-65`,看 `safeCreateIndex(collectionName, indexName, keys, opts)` 内部调 `db.collection(name).createIndex(...)` 时是否传了 `opts`。当前实现把 `opts` 丢了——唯一索引声明形同虚设。这是必须先修的 bug。

- [ ] **Step 2: 修改 `create-collections.js` 让 `safeCreateIndex` 真正传 opts**

在 `scripts/create-collections.js` 把内部 `createIndex` 调用改为传 `opts`。示例:

```js
async function safeCreateIndex(name, indexName, keys, opts = {}) {
  try {
    await db.collection(name).createIndex(keys, opts)
    console.log(`  ✓ ${indexName}`)
  } catch (e) {
    if (/already exists/i.test(e.message)) {
      console.log(`  · ${indexName} (已存在)`)
    } else {
      throw e
    }
  }
}
```

注意:`wx-server-sdk` 的 `createIndex` 签名是 `createIndex(keys, options)`,options 里可设 `unique: true`。

- [ ] **Step 3: 把 `weekly_entries` 加入创建列表**

`scripts/create-collections.js:25-26` 的 collections 数组加入 `'weekly_entries'`。同时在 41-50 行的索引声明区加入:

```js
await safeCreateIndex('weekly_entries', 'family_id_week_start', { family_id: 1, week_start: 1 }, { unique: true })
await safeCreateIndex('weekly_entries', 'family_id', { family_id: 1 })
```

- [ ] **Step 4: 跑创建脚本并验收**

Run: `node scripts/create-collections.js`
Expected: 打印 5 个集合,weekly_entries 的两个索引都标 `✓`(云端环境)或 weekly_entries 在本机 mock 时跳过(脚本需在 cloud 环境跑,可加 dry-run 开关,本任务只保证脚本语法与逻辑正确)。

- [ ] **Step 5: 在 `check-indexes.js` 同步加 weekly_entries 期望**

`scripts/check-indexes.js:31-36` 的 13 集合清单已含 `weekly_entries`;同时在 18-19 行的"预期唯一索引"区确认 `{ family_id: 1, week_start: 1 }` 已声明,缺失则补。

- [ ] **Step 6: 跑校验脚本**

Run: `node scripts/check-indexes.js`
Expected: weekly_entries 的 family_id+week_start 唯一索引存在(或环境不可达时给出明确提示,不算 fail)。

- [ ] **Step 7: Commit**

```bash
git add scripts/create-collections.js scripts/check-indexes.js
git commit -m "feat(db): weekly_entries 集合 + family_id+week_start 唯一索引, 修 createIndex opts bug

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 云函数 db.js 增加 weekly_entries 方法 + activate 语义

**Files:**
- Modify: `cloudfunctions/api/common/db.js`
- Test: `node scripts/test-tracking.js`(新脚本,Task 3 建)

**Interfaces:**
- Consumes:已存在的 `getUserByOpenid` / `getActivePlan` / `savePlan` 等
- Produces:以下新方法(均在 `db.js` 导出,handler 直接调):

```js
// 启用追踪:把当前 active plan 的 activated_at 置 now(幂等)
async function activatePlan(planId)
// 取当月 weekly entries(week_start 落在当月)
async function getMonthlyEntries(familyId, year, month)
// upsert:按 family_id+week_start 唯一键覆盖
async function saveWeeklyEntry(familyId, weekStart, weekEnd, categories)
// 取最近一个已存在的 entry(供 copyLastWeek)
async function getLastWeekEntry(familyId, beforeWeekStart)
// 取指定 week_start 的 entry(供 getCurrent)
async function getWeeklyEntry(familyId, weekStart)
```

- [ ] **Step 1: 修 `savePlan` 注释,确认 is_active 语义不变**

`cloudfunctions/api/common/db.js:135-149` 的 `savePlan` 仍保留 `is_active: true`(当前版本报告);`activated_at: null` 字段已存在,无需改 save 逻辑。**但注释中要明确:`activated_at` 由 activatePlan 单独置,本方法不填**。

- [ ] **Step 2: 新增 `activatePlan`**

在 `cloudfunctions/api/common/db.js` 末尾(导出前)加:

```js
async function activatePlan(planId) {
  if (!planId) throw new Error('activatePlan: planId 必填')
  const now_ = Date.now()
  // 幂等:已激活的 plan 不重复更新 activated_at
  const before = await db.collection('budget_plans').doc(planId).get()
  if (!before.data || before.data.length === 0) {
    throw new Error('plan 不存在')
  }
  const plan = before.data[0]
  if (plan.activated_at) {
    return plan
  }
  await db.collection('budget_plans').doc(planId).update({
    data: { activated_at: now_ }
  })
  return { ...plan, activated_at: now_ }
}
```

并把 `activatePlan` 加入 `module.exports`。

- [ ] **Step 3: 新增 weekly_entries 四个查询/写入方法**

```js
function currentMonthRange(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth()
  const first = new Date(y, m, 1)
  const last  = new Date(y, m + 1, 0) // 当月最后一天
  const iso = (dt) => dt.toISOString().slice(0, 10)
  return { start: iso(first), end: iso(last), year: y, month: m + 1 }
}

async function getMonthlyEntries(familyId, year, month) {
  // 用 month 字符串前缀简单过滤 + plan 周一起点即可
  const firstDay = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const nextFirst = new Date(year, month, 1).toISOString().slice(0, 10)
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: _.gte(firstDay).and(_.lt(nextFirst))
  }).get().catch(() => ({ data: [] }))
  return res.data || []
}

async function getWeeklyEntry(familyId, weekStart) {
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: weekStart
  }).limit(1).get().catch(() => ({ data: [] }))
  return (res.data && res.data[0]) || null
}

async function saveWeeklyEntry(familyId, weekStart, weekEnd, categories) {
  const total = Object.values(categories || {}).reduce((s, v) => s + (Number(v) || 0), 0)
  const now_ = Date.now()
  // upsert:先查,有则 update,无则 add
  const existing = await getWeeklyEntry(familyId, weekStart)
  if (existing) {
    await db.collection('weekly_entries').doc(existing._id).update({
      data: { categories, total, updated_at: now_ }
    })
    return { ...existing, categories, total, updated_at: now_ }
  }
  const res = await db.collection('weekly_entries').add({
    data: {
      family_id: familyId,
      week_start: weekStart,
      week_end: weekEnd,
      categories,
      total,
      created_at: now_,
      updated_at: now_
    }
  })
  return { _id: res._id, family_id: familyId, week_start: weekStart, week_end: weekEnd, categories, total, created_at: now_, updated_at: now_ }
}

async function getLastWeekEntry(familyId, beforeWeekStart) {
  // 简单实现:取 week_start < beforeWeekStart 的最新一条
  const res = await db.collection('weekly_entries').where({
    family_id: familyId,
    week_start: _.lt(beforeWeekStart)
  }).orderBy('week_start', 'desc').limit(1).get().catch(() => ({ data: [] }))
  return (res.data && res.data[0]) || null
}
```

注意:文件顶部需 `const _ = db.command`(参照 Phase 6 现有 db.js 已有的话直接用,否则加上)。

- [ ] **Step 4: 把 4 个新方法加入 module.exports**

`module.exports = { ..., activatePlan, getMonthlyEntries, getWeeklyEntry, saveWeeklyEntry, getLastWeekEntry, currentMonthRange }`。

- [ ] **Step 5: 跑现有测试确认无回归**

Run: `node scripts/test-engine.js && node scripts/test-auth.js`
Expected: 都通过(说明 db.js 修改未破坏现有方法)。

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/api/common/db.js
git commit -m "feat(db): weekly_entries CRUD + activatePlan (activated_at 幂等)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 6 个新云函数 action + 注册

**Files:**
- Modify: `cloudfunctions/api/handlers/index.js`
- Test: `scripts/test-tracking.js`(本任务创建)

**Interfaces:**
- Consumes:`requireUser / requireOwner / requireFamilyMember` 来自 `common/auth.js`;`db.*` 新方法来自 Task 2
- Produces:6 个新 handler:`plansActivate / dashboardGet / weeklyGetCurrent / weeklySubmit / weeklyCopyLastWeek`,在 `module.exports` 用 action key 注册

- [ ] **Step 1: 在 handlers 顶部引入 auth + db**

`cloudfunctions/api/handlers/index.js` 顶部加:

```js
const { requireUser, requireOwner, requireFamilyMember } = require('../common/auth')
const db = require('../common/db')
```

并把 `db` 已经在用的话避免重复声明。

- [ ] **Step 2: 写 `plansActivate`**

```js
async function plansActivate(ctx, payload) {
  if (!ctx.openid) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  const user = await db.getUserByOpenid(ctx.openid)
  const ownerErr = requireOwner(user)
  if (ownerErr) return ownerErr

  const plan = await db.getActivePlan(user.family_id)
  if (!plan) return fail(ERROR_CODE.NOT_FOUND, 'NOT_FOUND', '当前没有 active plan')

  const updated = await db.activatePlan(plan._id)
  return ok({ plan: updated })
}
```

- [ ] **Step 3: 写 `dashboardGet`(核心聚合)**

```js
function colorOf(pct) {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

async function dashboardGet(ctx, payload) {
  if (!ctx.openid) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  const user = await db.getUserByOpenid(ctx.openid)
  const memberErr = requireFamilyMember(user)
  if (memberErr) return memberErr

  const plan = await db.getActivePlan(user.family_id)
  if (!plan) {
    return ok({ activated: false, plan: null, categories: [], totals: null, baby_reserve: null })
  }
  const activated = !!plan.activated_at
  if (!activated) {
    return ok({ activated: false, plan: { _id: plan._id, monthly_summary: plan.monthly_summary, baby_reserve: plan.baby_reserve }, categories: [], totals: null, baby_reserve: plan.baby_reserve || null })
  }

  const now = new Date()
  const monthEntries = await db.getMonthlyEntries(user.family_id, now.getFullYear(), now.getMonth() + 1)
  const usedByCat = { food: 0, daily: 0, entertainment: 0, medical: 0, clothing: 0, transport: 0, other: 0 }
  for (const e of monthEntries) {
    for (const k of Object.keys(usedByCat)) {
      usedByCat[k] += Number((e.categories && e.categories[k]) || 0)
    }
  }
  const categories = (plan.categories || []).map(c => {
    const used = usedByCat[c.id] || 0
    const pct = c.suggested > 0 ? Math.round((used / c.suggested) * 100) : 0
    return { id: c.id, name: c.name, suggested: c.suggested, used, pct, color: colorOf(pct) }
  })
  const totalUsed = Object.values(usedByCat).reduce((s, v) => s + v, 0)
  const totalSuggested = plan.monthly_summary && plan.monthly_summary.disposable ? plan.monthly_summary.disposable : 0
  const totalPct = totalSuggested > 0 ? Math.round((totalUsed / totalSuggested) * 100) : 0

  return ok({
    activated: true,
    plan: { _id: plan._id, monthly_summary: plan.monthly_summary, baby_reserve: plan.baby_reserve },
    categories,
    totals: { used: totalUsed, suggested: totalSuggested, pct: totalPct, color: colorOf(totalPct) },
    baby_reserve: plan.baby_reserve || null
  })
}
```

- [ ] **Step 4: 写 weekly 三个 handler**

```js
function isoWeekRange(d = new Date()) {
  // ISO 周一
  const day = d.getDay() || 7 // 周日=0 视作 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const iso = (dt) => dt.toISOString().slice(0, 10)
  return { weekStart: iso(monday), weekEnd: iso(sunday) }
}

async function weeklyGetCurrent(ctx, payload) {
  if (!ctx.openid) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  const user = await db.getUserByOpenid(ctx.openid)
  const memberErr = requireFamilyMember(user)
  if (memberErr) return memberErr
  const { weekStart, weekEnd } = isoWeekRange()
  const entry = await db.getWeeklyEntry(user.family_id, weekStart)
  return ok({ entry, weekStart, weekEnd })
}

async function weeklySubmit(ctx, payload) {
  if (!ctx.openid) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  const user = await db.getUserByOpenid(ctx.openid)
  const memberErr = requireFamilyMember(user)
  if (memberErr) return memberErr
  if (!payload || !payload.categories) return fail(ERROR_CODE.VALIDATION_ERROR, 'VALIDATION_ERROR', '缺少 categories')

  const { weekStart, weekEnd } = isoWeekRange()
  // 校验 7 类
  const validIds = ['food','daily','entertainment','medical','clothing','transport','other']
  const cats = {}
  for (const id of validIds) cats[id] = Math.max(0, Math.round(Number(payload.categories[id]) || 0))

  const entry = await db.saveWeeklyEntry(user.family_id, weekStart, weekEnd, cats)
  return ok({ entry })
}

async function weeklyCopyLastWeek(ctx, payload) {
  if (!ctx.openid) return fail(ERROR_CODE.UNAUTHORIZED, 'UNAUTHORIZED', '请先登录')
  const user = await db.getUserByOpenid(ctx.openid)
  const memberErr = requireFamilyMember(user)
  if (memberErr) return memberErr
  const { weekStart } = isoWeekRange()
  const last = await db.getLastWeekEntry(user.family_id, weekStart)
  return ok({ categories: last ? last.categories : null })
}
```

- [ ] **Step 5: 注册 6 个 action**

`module.exports` 末尾加入:

```js
'plans.activate': plansActivate,
'dashboard.get': dashboardGet,
'weekly.getCurrent': weeklyGetCurrent,
'weekly.submit': weeklySubmit,
'weekly.copyLastWeek': weeklyCopyLastWeek,
```

- [ ] **Step 6: 写 `scripts/test-tracking.js` 冒烟测试**

参照 `scripts/test-auth.js` 的本地 memoryStore 模式(它直接读 handlers/index.js 的 `memoryStore` 并 mock 入口)。脚本逻辑:

```js
// scripts/test-tracking.js
// 用 require('../uniapp/cloudfunctions/api/handlers') 直接调 handler
const path = require('path')
process.chdir(path.join(__dirname, '..'))
const handlers = require('../uniapp/cloudfunctions/api/handlers')

function ctxOf(openid) { return { openid, OPENID: openid } }

async function bootstrap() {
  // 1. user.bootstrap 创用户
  // 2. plans.save 存 plan
  // 3. plans.activate
  // 4. weekly.submit
  // 5. weekly.getCurrent 应拿到
  // 6. weekly.submit 再次同周 -> 覆盖
  // 7. dashboard.get 验证聚合
  // 8. weekly.copyLastWeek 应返回上周 categories
  // 每步 assert
}
bootstrap().catch(e => { console.error(e); process.exit(1) })
```

要求:每步用 `console.log` 打断言信息,失败抛错。`user.bootstrap` / `plans.save` 已有本地 path 走 memoryStore,直接复用。

- [ ] **Step 7: 跑测试**

Run: `node scripts/test-tracking.js`
Expected: 全部 step 通过,打印 `T7-1 启用 → 填周 → 看板 PASS` / `T7-2 同周覆盖 PASS` / `T7-3 月初聚合 PASS` / `T7-4 未启用空态 PASS`。

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions/api/handlers/index.js scripts/test-tracking.js
git commit -m "feat(cloud): 6 个新 action (activate/dashboard/weekly) + tracking 测试脚本

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: openid 来源核验 + 必要时改 `cloud.getWXContext()`

**Files:**
- Modify: `cloudfunctions/api/index.js:60-66`

**Interfaces:**
- Consumes:微信云函数 context
- Produces:可靠的 `ctx.openid`

- [ ] **Step 1: 实测 openid 来源**

部署当前代码到云端,在小程序开发者工具真机/远程调试调用 `plans.activate`。若返回 `UNAUTHORIZED`,说明 `ctx.openid` 为 null → 改方案。

- [ ] **Step 2: 若需修复,改 `cloudfunctions/api/index.js`**

把:
```js
const wxContext = (cloud && context && context.wxContext) || {}
const ctx = {
  openid: wxContext.OPENID || null,
  ...
}
```

改为标准写法(技术方案 §OpenID):
```js
const cloud = require('wx-server-sdk')
const wxContext = cloud.getWXContext()
const ctx = {
  openid: wxContext.OPENID || null,
  appid: wxContext.APPID,
  unionid: wxContext.UNIONID,
}
```

注意:`index.js` 顶部 `cloud = require('wx-server-sdk')` 已在的话直接用,确保 `initCloud` 已被调用(参照 Phase 6)。

- [ ] **Step 3: 重新跑测试并真机验证**

Run: `node scripts/test-tracking.js` + 真机调用 1 次。
Expected: 测试通过;真机不再 `UNAUTHORIZED`。

- [ ] **Step 4: Commit(若改动)**

```bash
git add cloudfunctions/api/index.js
git commit -m "fix(cloud): openid 改用 cloud.getWXContext() 标准写法

Co-Authored-By: Claude <noreply@anthropic.com>"
```

如果 Step 1 验证原写法已可用,本任务仅记录结论不产生 commit,直接在计划里标 `N/A`。

---

## Task 5: 前端 services 层统一

**Files:**
- Create: `uniapp/src/services/api.js`
- Modify: `uniapp/src/utils/engineClient.js`(保留转发层,标记 deprecated)

**Interfaces:**
- Consumes:`wx.cloud.callFunction` 来自 `services/cloud.js`
- Produces:统一入口 `api.js`,导出:`bootstrapUser` / `savePlan` / `getActivePlan` / `activatePlan` / `getDashboard` / `getCurrentWeekly` / `submitWeekly` / `copyLastWeek`

- [ ] **Step 1: 新建 `uniapp/src/services/api.js`**

```js
// uniapp/src/services/api.js
// 业务云函数统一入口
import { callFunction } from './cloud'

function wrap(action) {
  return async (payload = {}) => {
    try {
      return await callFunction(action, payload)
    } catch (e) {
      console.error(`[api.${action}]`, e)
      throw e
    }
  }
}

export const bootstrapUser  = wrap('user.bootstrap')
export const savePlan       = wrap('plans.save')
export const getActivePlan  = wrap('plans.getActive')
export const activatePlan   = wrap('plans.activate')
export const getDashboard   = wrap('dashboard.get')
export const getCurrentWeekly = wrap('weekly.getCurrent')
export const submitWeekly   = wrap('weekly.submit')
export const copyLastWeek   = wrap('weekly.copyLastWeek')
```

- [ ] **Step 2: `engineClient.js` 改为转发,保留 import 不破坏**

`uniapp/src/utils/engineClient.js` 内部把 `callWxLogin` / `callPlanSave` / `callPlanGetActive` 改为 `export const callWxLogin = (p) => import('../services/api').then(m => m.bootstrapUser(p))` 这种转发(或更直接:`import * as api from '../services/api'`,然后 `export const callWxLogin = api.bootstrapUser`)。

- [ ] **Step 3: 全仓搜索 import 路径,确认无破坏**

`grep -r "engineClient" uniapp/src` 应只剩 `engineClient.js` 自身作为导出方,无其他业务页面直接调它内部细节。

- [ ] **Step 4: 在 report/preview 接入 `activatePlan`**

`uniapp/src/subpackages/report/preview.vue:81-83` 改 `onActivate`:

```js
import { activatePlan } from '@/services/api'
async function onActivate() {
  try {
    uni.showLoading({ title: '启用中...' })
    await activatePlan({})
    uni.hideLoading()
    uni.showToast({ title: '已启用追踪', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 600)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.message || '启用失败', icon: 'none' })
  }
}
```

`full.vue:73-78` 同样替换(去掉 `stubTap`)。

- [ ] **Step 5: 跑前端构建确认无 import 错**

Run: `cd uniapp && npm run build:mp-weixin` 或 `npx uni build` 视项目 script。
Expected: 构建成功(无 import / 语法错)。具体命令看 `uniapp/package.json`。

- [ ] **Step 6: Commit**

```bash
git add uniapp/src/services/api.js uniapp/src/utils/engineClient.js uniapp/src/subpackages/report/preview.vue uniapp/src/subpackages/report/full.vue
git commit -m "feat(services): 统一云调用层 services/api + report 接入 activatePlan

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 新增 `stores/plan.js`

**Files:**
- Create: `uniapp/src/stores/plan.js`

**Interfaces:**
- Consumes:`bootstrapUser / getActivePlan / getDashboard / activatePlan` 来自 `services/api`
- Produces:Pinia store 字段 `activePlan / activated / dashboard / loading / error` + actions `loadActive / activate / loadDashboard`

- [ ] **Step 1: 写 `stores/plan.js`**

```js
// uniapp/src/stores/plan.js
import { defineStore } from 'pinia'
import { getActivePlan, activatePlan, getDashboard } from '@/services/api'

export const usePlanStore = defineStore('plan', {
  state: () => ({
    activePlan: null,
    activated: false,
    dashboard: null,
    loading: false,
    error: null
  }),
  actions: {
    async loadActive() {
      this.loading = true
      this.error = null
      try {
        const res = await getActivePlan()
        this.activePlan = res.plan || null
        this.activated = !!(this.activePlan && this.activePlan.activated_at)
      } catch (e) {
        this.error = e.message
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
        return res.plan
      } catch (e) {
        this.error = e.message
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
        this.error = e.message
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
    }
  }
})
```

- [ ] **Step 2: 验证 Pinia 已注册**

`uniapp/src/main.js` 已注册 Pinia(Phase 6 已确认)。本任务无需改 main.js,只确保 `import { usePlanStore } from '@/stores/plan'` 在 Vue 文件里能拿到。

- [ ] **Step 3: Commit**

```bash
git add uniapp/src/stores/plan.js
git commit -m "feat(stores): plan store (active/activated/dashboard)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: dashboard 页数据化

**Files:**
- Modify: `uniapp/src/pages/dashboard/index.vue`
- Modify: `uniapp/src/pages/dashboard/empty.vue`(可选微调,CTA 直接调 `activate()`)
- Modify: `uniapp/src/components/FloatNav.vue`(确保 tab 跳 dashboard 仍有效)

**Interfaces:**
- Consumes:`usePlanStore` 来自 Task 6
- Produces:`onShow` 拉 dashboard,渲染总进度条 + 7 类 + 备育条,空态自动切换

- [ ] **Step 1: 替换硬编码数据为 store 加载**

`uniapp/src/pages/dashboard/index.vue` 整体重写关键部分(保留现有 UI 结构与样式,Bento 配色不动):

```js
import { usePlanStore } from '@/stores/plan'
const store = usePlanStore()

onShow(async () => {
  try {
    await store.loadDashboard()
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
})

const activated = computed(() => store.activated)
const dashboard = computed(() => store.dashboard)
const categories = computed(() => (dashboard.value && dashboard.value.categories) || [])
const totals = computed(() => (dashboard.value && dashboard.value.totals) || null)
const babyReserve = computed(() => (dashboard.value && dashboard.value.baby_reserve) || null)
```

- [ ] **Step 2: 模板分支 — 空态**

```vue
<view v-if="!activated" class="empty-wrap">
  <image src="/static/dashboard-empty.png" mode="aspectFit" class="empty-illu" />
  <text class="empty-title">还没有启用追踪</text>
  <text class="empty-sub">启用后这里会显示本月 7 类预算进度</text>
  <button class="btn-primary" @click="onActivate">启用预算追踪</button>
</view>
```

`onActivate` 调 `store.activate()` 后 `await store.loadDashboard()`。

- [ ] **Step 3: 模板分支 — 实态(总进度 + 7 类 + 备育)**

```vue
<view v-else>
  <view class="total-card">
    <text class="total-label">本月预算</text>
    <text class="total-num">¥{{ totals.suggested }}</text>
    <progress-bar :pct="totals.pct" :color="totals.color" />
    <text class="total-meta">已用 ¥{{ totals.used }} · {{ totals.pct }}%</text>
  </view>

  <view v-for="c in categories" :key="c.id" class="cat-row" @click="goWeekly">
    <text class="cat-name">{{ c.name }}</text>
    <text class="cat-num">¥{{ c.used }} / ¥{{ c.suggested }}</text>
    <progress-bar :pct="c.pct" :color="c.color" />
  </view>

  <view v-if="babyReserve" class="baby-card">
    <text>备育储备</text>
    <progress-bar :pct="babyReserve.pct" :color="babyReserve.color" />
    <text>¥{{ babyReserve.used }} / ¥{{ babyReserve.target }}</text>
  </view>
</view>
```

- [ ] **Step 4: 实现 `progress-bar` 组件(若未存在)**

`uniapp/src/components/ProgressBar.vue`:props `pct` / `color`,模板用一个底层 bar + 上面进度条 (百分比 width + 颜色)。颜色映射 `green:#7BC47F / yellow:#F5B041 / red:#E74C3C`(与既有设计色板一致,可在 styles 中查)。

- [ ] **Step 5: 跳 weekly / 启用 / 重新测算按钮接真实**

- 「周度填写」: `uni.reLaunch({ url: '/pages/weekly/index' })`
- 「行动清单」: `uni.reLaunch({ url: '/pages/actions/index' })`
- 「启用预算追踪」: `await store.activate(); await store.loadDashboard()`

- [ ] **Step 6: 跑构建确认**

Run: `cd uniapp && npm run build:mp-weixin`(看 package.json)
Expected: 无报错。

- [ ] **Step 7: Commit**

```bash
git add uniapp/src/pages/dashboard/index.vue uniapp/src/pages/dashboard/empty.vue uniapp/src/components/ProgressBar.vue
git commit -m "feat(dashboard): 数据化 + 空态/实态分支 + 进度条组件

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: weekly 页数据化

**Files:**
- Modify: `uniapp/src/pages/weekly/index.vue`

**Interfaces:**
- Consumes:`getCurrentWeekly / submitWeekly / copyLastWeek` 来自 `services/api`
- Produces:`onLoad` 拉本周 entry 预填;「复制上周」按钮;「提交」接 submitWeekly

- [ ] **Step 1: 引入 7 类常量**

```js
const CATEGORIES = [
  { id: 'food',          label: '餐饮' },
  { id: 'daily',         label: '日用' },
  { id: 'entertainment', label: '娱乐' },
  { id: 'medical',       label: '医疗' },
  { id: 'clothing',      label: '服饰' },
  { id: 'transport',     label: '交通' },
  { id: 'other',         label: '其他' },
]
const cats = ref(CATEGORIES.map(c => ({ ...c, amount: '' })))
```

- [ ] **Step 2: onLoad 拉本周 entry 预填**

```js
import { getCurrentWeekly, copyLastWeek, submitWeekly } from '@/services/api'
const weekBadge = ref('')

onLoad(async () => {
  try {
    const res = await getCurrentWeekly()
    weekBadge.value = `${res.weekStart} — ${res.weekEnd}`
    if (res.entry) {
      cats.value = cats.value.map(c => ({ ...c, amount: String(res.entry.categories[c.id] ?? '') }))
    }
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
})
```

- [ ] **Step 3: 实现 `onCopyLast`**

```js
async function onCopyLast() {
  try {
    const res = await copyLastWeek()
    if (!res.categories) {
      uni.showToast({ title: '没有上周数据', icon: 'none' })
      return
    }
    cats.value = cats.value.map(c => ({ ...c, amount: String(res.categories[c.id] ?? '') }))
    uni.showToast({ title: '已复制上周', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' })
  }
}
```

- [ ] **Step 4: 实现 `onSubmit`**

```js
async function onSubmit() {
  const categories = {}
  for (const c of cats.value) categories[c.id] = Math.max(0, Math.round(Number(c.amount) || 0))
  try {
    uni.showLoading({ title: '提交中...' })
    await submitWeekly({ categories })
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 500)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.message || '提交失败', icon: 'none' })
  }
}
```

- [ ] **Step 5: 模板补稳定 id**

`v-for="(c, idx) in cats"` 改成 `v-for="c in cats" :key="c.id"`,把每个 `name` 字段改为 `c.label`(或保留 `name` 但补 id 字段)。输入框 `v-model="c.amount"` + `data-id="c.id"`。

- [ ] **Step 6: 跑构建**

Run: `cd uniapp && npm run build:mp-weixin`
Expected: 无报错。

- [ ] **Step 7: Commit**

```bash
git add uniapp/src/pages/weekly/index.vue
git commit -m "feat(weekly): 拉本周预填 + 复制上周 + 提交 upsert

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: home 页数据化 + 无 plan 跳空态

**Files:**
- Modify: `uniapp/src/pages/home/index.vue`
- Modify: `uniapp/src/pages/login/index.vue`(默认进 home 而非静态填值)

**Interfaces:**
- Consumes:`usePlanStore.loadActive` 来自 Task 6
- Produces:`onShow` 加载 activePlan;无 plan 跳 `pages/home/empty`;有 plan 填真实字段

- [ ] **Step 1: home/index.vue 接入 store**

```js
import { usePlanStore } from '@/stores/plan'
const store = usePlanStore()
onShow(async () => {
  await store.loadActive()
  if (!store.activePlan) {
    uni.reLaunch({ url: '/pages/home/empty' })
  }
})
const health = computed(() => store.activePlan?.health_score ?? 0)
const monthly = computed(() => store.activePlan?.monthly_summary || {})
const baby    = computed(() => store.activePlan?.baby_reserve || null)
const recs    = computed(() => (store.activePlan?.recommendations || []).slice(0, 2))
```

- [ ] **Step 2: 模板替换硬编码**

健康分、储蓄 `¥{{ monthly.savings_target }}`、可支配 `¥{{ monthly.disposable }}`、备育储备从 `baby` 读(若 `baby === null` 隐藏备育卡)。2 条建议从 `recs` 读。

- [ ] **Step 3: 修 `login/index.vue` 完成后跳转**

`uniapp/src/pages/login/index.vue:24-30` 当前登录后跳 home/index,改为先 `await store.loadActive()`,再判断:
- `activePlan` 存在 → `uni.reLaunch({ url: '/pages/home/index' })`
- 否则 → `uni.reLaunch({ url: '/pages/home/empty' })`

如果工程中 `login` 页面不直接 import store,可以先在 `App.vue` 加一个 `onLaunch` 里调 `loadActive()`(全局初始化),login 跳转前再调一次保证新鲜。

- [ ] **Step 4: App.vue 接入 store 初始化**

```js
// uniapp/src/App.vue
import { usePlanStore } from '@/stores/wizard' // 不对,应当
import { usePlanStore as usePlan } from '@/stores/plan'
// onLaunch 末尾
const plan = usePlan()
plan.loadActive()
```

(具体 import 语法按 Pinia 习惯。)

- [ ] **Step 5: 跑构建**

Run: `cd uniapp && npm run build:mp-weixin`
Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
git add uniapp/src/pages/home/index.vue uniapp/src/pages/login/index.vue uniapp/src/App.vue
git commit -m "feat(home): 数据化 + 无 plan 跳空态 + 登录后路由分支

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: setup-reminder 接真实订阅授权

**Files:**
- Modify: `uniapp/src/pages/setup-reminder/index.vue`

**Interfaces:**
- Consumes:`uni.requestSubscribeMessage` 微信 API
- Produces:真实订阅授权引导,授权状态记 localStorage

- [ ] **Step 1: 实现 `onSubscribe`**

```js
const tmplIds = ['YOUR_TPL_ID_1', 'YOUR_TPL_ID_2'] // TODO: 申请后填入
function onSubscribe() {
  uni.requestSubscribeMessage({
    tmplIds,
    success: (res) => {
      const accepted = Object.values(res).filter(v => v === 'accept').length
      uni.setStorageSync('subscribe_status', { accepted, at: Date.now() })
      uni.showToast({ title: '已开启提醒', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/dashboard/index' }), 600)
    },
    fail: (e) => {
      uni.showToast({ title: e.errMsg || '订阅失败', icon: 'none' })
    }
  })
}
```

- [ ] **Step 2: 注释占位**

`tmplIds` 数组开头加注释:`// 真实模板 ID 需在小程序后台申请后填入,本阶段仅做授权引导(留 P1 推服务端)`。如果申请未就绪,空数组也能跑通(`requestSubscribeMessage` 在 tmplIds 为空时仍会回调,只是不会真订阅)。

- [ ] **Step 3: 跑构建**

Run: `cd uniapp && npm run build:mp-weixin`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add uniapp/src/pages/setup-reminder/index.vue
git commit -m "feat(reminder): 接 requestSubscribeMessage 授权引导

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: 端到端验收 + M6 标记

**Files:**
- Modify: `docs/PHASE-1-3-SUMMARY.md`(新建 `docs/PHASE-4-6-SUMMARY.md`,记录 M3–M6 进展)
- Verify: 手动或脚本回归 T7-1 ~ T7-4

- [ ] **Step 1: 跑全部测试**

Run: `node scripts/test-engine.js && node scripts/test-auth.js && node scripts/test-rules.js && node scripts/test-tracking.js`
Expected: 全部通过。

- [ ] **Step 2: 跑前端构建**

Run: `cd uniapp && npm run build:mp-weixin`
Expected: 成功。

- [ ] **Step 3: 写 PHASE-4-6 总结**

新建 `docs/PHASE-4-6-SUMMARY.md`,记录 M3/M4/M5/M6 各阶段达成的关键能力、action 列表、weekly_entries 集合、激活语义决策、剩余 P1 项(订阅推送、行动清单落库、伴侣关联、复盘增强)。

- [ ] **Step 4: 合并回 develop**

```bash
git checkout develop
git merge --no-ff feature/phase-7-tracking -m "merge: Phase 7 预算追踪闭环 (M6 达成)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin develop
```

- [ ] **Step 5: 打 tag**

```bash
git tag release/m6
git push origin release/m6
```

- [ ] **Step 6: 总结**

回复用户:Phase 7 完成,主要变更点 + 5 个验收场景已通过 + 1 个已知未做项(订阅消息服务端推送留 P1)。
