# Phase 4–6 总结(M3–M6 达成)

> 前接 [PHASE-1-3-SUMMARY.md](PHASE-1-3-SUMMARY.md),本文记录 Phase 4 完整向导、Phase 5 规则引擎 + 完整报告、Phase 6 微信登录 + 报告持久化、Phase 7 预算追踪闭环。

---

## 一、各阶段达成的关键能力

### Phase 4 — 完整 5 步向导(M3)
- **subpackages/wizard/step1–step5** + step3-warn + loading 页面
- Pinia store `stores/wizard.js` 持有 5 步状态
- 备育分支在 step4 解锁(step1 选 planning/pregnant)
- 快测结果页可「一键带入」city/income/housing
- loading 三步骤文案 + plans.save 持久化

### Phase 5 — 规则引擎 + 完整报告(M4)
- **R01–R07 + R-N01–R-N07** 规则(`cloudfunctions/api/common/rules/`)
- 影响 × 可执行性 × 阶段权重 三维排序
- `subpackages/report/full.vue` 完整报告(健康分 + 总预算 + 7 类 + 备育 + 风险 + Top 建议)
- 「启用追踪」按钮(原 stub,Phase 7 接入)

### Phase 6 — 微信登录 + 报告持久化(M5)
- `user.bootstrap` 云函数,owner + family + financial_profile 三件套
- `plans.save` 把报告落到 `budget_plans` 集合,`is_active` 单版本约束
- 客户端 `engineClient.callWxLogin / callPlanSave / callPlanGetActive`
- 杀进程重开报告仍在(T6-1)

### Phase 7 — 预算追踪闭环(M6,本文重点)
- `activated_at` 标记「启用追踪」,与 Phase 6 `is_active` 解耦,零回归
- `weekly_entries` 集合 + `family_id+week_start` 唯一索引(T7-2)
- 5 个新云函数 action: `plans.activate / dashboard.get / weekly.getCurrent / weekly.submit / weekly.copyLastWeek`
- `services/api.js` + `stores/plan.js` 单一权威来源
- 5 个页面数据化:home / dashboard / weekly / setup-reminder / report 双页启用入口

---

## 二、Phase 7 实施细节

### 2.1 关键设计决策

| 决策 | 选项 | 选定 | 理由 |
|------|------|------|------|
| 启用追踪语义 | `activated_at` / 改 `is_active` / 新字段 | **`activated_at`** | 兼容 Phase 6 零回归 |
| 周边界 | 周一/周日起 / 月度 | **ISO 周一起,自然月聚合** | 与技术方案示例一致 |
| 调用层 | services 统一 / 沿用 engineClient | **services 新入口 + engineClient 保留** | 历史 7 调用点不动,新 action 走独立入口 |
| 订阅消息 | 真授权 + 推送 / 仅授权 | **仅授权引导** | 服务端推送留 P1 |
| 行动清单采纳 | 写库 / 不动 | **不动,留 P1** | 范围聚焦 |

### 2.2 数据库新增

**`weekly_entries` 集合 + 索引**(`scripts/create-collections.js`):
```
weekly_entries.family_week_start: { family_id: 1, week_start: 1 } UNIQUE
weekly_entries.family_id: { family_id: 1 }
```

> 顺手修复了 `safeCreateIndex` 的 `opts` 丢失 bug(createIndex 的 `unique:true` 真正生效)。

### 2.3 5 个新云函数 action

| action | 鉴权 | 说明 |
|--------|------|------|
| `plans.activate` | owner | 幂等置 `activated_at` |
| `dashboard.get` | member | 聚合当月 weekly entries,返回 `{activated, plan, categories[], totals, baby_reserve}` |
| `weekly.getCurrent` | member | 返回本周 entry + ISO week 范围 |
| `weekly.submit` | member | 7 类校验 + upsert (按唯一索引) |
| `weekly.copyLastWeek` | member | 返回上周 categories,前端填表后 submit |

> 鉴权沿用 handler 内联检查模式(openid + role/family),不引入 `common/auth.js`(`requireUser` 在本地测试会因 wx-server-sdk 缺失而崩溃)。

### 2.4 看板计算

```
某类已用 = 本月所有 weekly_entries 该类之和
某类进度 = 已用 / plan.categories[i].suggested
总进度   = Σ已用 / plan.monthly_summary.disposable
配色     = <70 绿 / 70–89 黄 / ≥90 红
```

### 2.5 前端数据流

```
App.vue onLaunch → planStore.loadActive()        # 缓存 activePlan
       ↓
home/dashboard onShow → loadDashboard()          # 拉当月看板快照
       ↓
report/preview · full onActivate → activatePlan() → reLaunch dashboard
weekly onLoad → getCurrent()                    # 预填本周
weekly onCopyLast → copyLastWeek()              # 复制上周数值
weekly onSubmit → submitWeekly() → dashboard
setup-reminder onSubscribe → uni.requestSubscribeMessage  # 仅授权
```

---

## 三、验证结果

```
test-engine     29/29 PASS
test-auth       10/10 PASS
test-rules      16/16 PASS
test-tracking   11/11 PASS  (新增: T7-1..T7-4 + 校验 + copyLastWeek)
─────────────────────────
Total           66/66 PASS
```

### T 验收覆盖

| 验收 | 状态 |
|------|------|
| 点击「启用预算追踪」后看板从 0% 开始 | ✅ T7-1 |
| 填报 ¥500 餐饮后进度立即更新 | ✅ T7-1 |
| 「复制上周」复制 7 类数值 | ✅ test-tracking(copyLastWeek 有上条) |
| 某类 ≥80% 时看板警告态 | ✅ colorOf ≥90 红, 70–89 黄 |
| 备育用户首页可见储备进度条 | ✅ home + dashboard 双页 |
| T7-1 启用 → 填周 → 看板 | ✅ |
| T7-2 同周覆盖 | ✅ |
| T7-3 月初重置 | ✅ getMonthlyEntries 范围过滤 |
| T7-4 未启用空态 | ✅ |

---

## 四、剩余 P1 项

| 项 | 说明 | 优先级 |
|----|------|--------|
| 订阅消息服务端推送 | Phase 7 只做了授权引导,服务端定时推送留 P1 | 中 |
| 行动清单采纳写库 | 本阶段不动,继续 localStorage | 中 |
| 伴侣关联 + 家庭成员 | Phase 10 路径 | 低 |
| 复盘增强 | Phase 10 路径 | 低 |
| engineClient 与 services/api 收敛 | 双套并存,Phase 9 内测前清理 | 中 |

---

## 五、文件清单

新增 8 / 修改 13:

### 新增
- `uniapp/src/services/api.js` — 业务云函数统一入口
- `uniapp/src/stores/plan.js` — 当前方案 store
- `uniapp/src/components/ProgressBar.vue` — 进度条
- `scripts/test-tracking.js` — Phase 7 测试
- `docs/superpowers/specs/2026-07-23-phase-7-budget-tracking-design.md` — 设计文档
- `docs/superpowers/plans/2026-07-24-phase-7-tracking.md` — 实现计划
- `docs/PHASE-4-6-SUMMARY.md` — 本文档

### 修改
- `scripts/create-collections.js` — `weekly_entries` 集合 + 索引 + opts bug 修复
- `uniapp/cloudfunctions/api/common/db.js` — `activatePlan` + 4 个 weekly_entries 方法
- `uniapp/cloudfunctions/api/handlers/index.js` — 5 个新 handler + 注册
- `uniapp/cloudfunctions/api/index.js` — `cloud.getWXContext()` 标准写法
- `uniapp/src/pages/home/index.vue` — 数据化
- `uniapp/src/pages/dashboard/index.vue` — 数据化 + 空态/实态分支
- `uniapp/src/pages/weekly/index.vue` — 数据化 + 复制上周 + submit
- `uniapp/src/pages/setup-reminder/index.vue` — 真实订阅授权引导
- `uniapp/src/subpackages/report/preview.vue` + `full.vue` — 启用追踪入口接入
- `uniapp/src/pages/login/index.vue` — 登录后路由分支
- `uniapp/src/App.vue` — onLaunch 拉一次 activePlan

---

## 六、下一步

按开发计划,Phase 8 = **商业化 + 分享**(M7):
- 付费解锁完整 7 类 + 全部建议 + PDF
- 分享长图
- 沙箱支付 + blur 解除

Phase 9 = **内测与质量**(M8):50 人内测 + 漏斗埋点 + P0 清零。