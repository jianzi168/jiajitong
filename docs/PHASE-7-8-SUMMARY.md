# Phase 7-8 总结 (M6-M7 达成)

> 前接 [PHASE-4-6-SUMMARY.md](PHASE-4-6-SUMMARY.md) 与 [PHASE-1-3-SUMMARY.md](PHASE-1-3-SUMMARY.md)。本文合并 M6 (Phase 7 预算追踪闭环) 与 M7 (Phase 8 商业化 + 分享) 的关键成果, 作为 MVP 主流程的完整节点。

---

## 一、里程碑达成

| 里程碑 | 阶段 | 状态 |
|--------|------|------|
| M0 工程就绪 | Phase 0 | ✅ |
| M1 引擎可用 | Phase 1 | ✅ |
| M2 快测闭环 | Phase 3 | ✅ |
| M3 规划闭环 | Phase 4 | ✅ |
| M4 报告完整 | Phase 5 | ✅ |
| M5 账户闭环 | Phase 6 | ✅ |
| **M6 追踪闭环** | Phase 7 | ✅ |
| **M7 商业闭环** | Phase 8 | ✅ |
| M8 内测版 | Phase 9 | ⏳ |

---

## 二、Phase 7 关键能力 (M6)

- `activated_at` 标记「启用追踪」,与 Phase 6 `is_active` 解耦,零回归
- `weekly_entries` 集合 + `family_id+week_start` 唯一索引 (T7-2 同周覆盖)
- 5 个新云函数 action: `plans.activate` / `dashboard.get` / `weekly.getCurrent` / `weekly.submit` / `weekly.copyLastWeek`
- 5 个页面数据化: home / dashboard / weekly / setup-reminder / 报告双页启用入口
- `ensureAndActivate()` 解决报告页无云端 plan 时补 save

---

## 三、Phase 8 关键能力 (M7, 本文重点)

### 3.1 商业化数据基础
- 新增 `subscriptions` / `orders` / `app_config` 三个集合
- 业务主键 `family_id` (一户一份订阅)
- 唯一索引: `subscriptions.family_id` / `app_config.key`
- 价格配置走 `app_config.paywall_prices_v1`, 前端 fallback 写死

### 3.2 4 个新云函数 action

| action | 鉴权 | 说明 |
|--------|------|------|
| `orders.create` | owner | 创建 pending 订单, 金额从 SKU 表取, 已有 Pro 拒绝降级 |
| `orders.mockPay` | owner | Mock 支付, 置 paid + upsert subscription, 幂等 |
| `subscription.get` | member | 读真实订阅 + 算 entitlements (canViewFull / canExportPdf / canShareFree / daysRemaining) |
| `share.getQrCode` | member | `wxacode.getUnlimited` + 失败兜底 placeholder |

`user.bootstrap` 同步改造, 替换原 `subscription: { plan_type: 'free' }` 空壳为真实读。

### 3.3 权益计算纯函数
- `calcEntitlements(plan_type, expires_at, now)` 可注入 `now` 测跨年/2 月 29 日
- `computeExpiresAt(order, currentSub, now)` 处理 report_once / pro_yearly 首次/续费/覆盖
- fail-closed: 未加载完成时 `canViewFull = false`; 网络错误按 free 算, 不复用可能已过期的正向缓存

### 3.4 Mock 支付设计
- 字段集 (`amount_fen` / `out_trade_no` / `status` / `paid_at` / `wx_transaction_id` / `pay_channel`) 全部就位
- `pay_channel='mock'` 写入, 未来真支付 (`cloudPay.unifiedOrder` + `payNotify`) 只需替换 `orders.create` 内部分支
- 订单幂等: `client_request_id` 唯一索引防重试双订单 (P1 上线)
- 履约幂等: 同一 paid 订单重试不重复延长权益 (T8-4 验证)

### 3.5 权益矩阵 (前端 gate)

| 能力 | free | report_once (7d) | pro_yearly |
|------|------|------------------|------------|
| 健康分 / 风险评级 / 总预算 | ✅ | ✅ | ✅ |
| 报告分类预算 | 前 2 类 | 完整 7 类 | 完整 7 类 |
| 计算依据 | ❌ | ✅ | ✅ |
| 优化建议 | 第 1 条 | 全部 | 全部 |
| 备育专项 | 摘要 | 完整 | 完整 |
| `report/full` | **锁态拦截** | 可进入 | 可进入 |
| PDF 导出 | ❌ | ✅ | ✅ |
| 看板完整 7 类 | 前 2 类 | 完整 7 类 | 完整 7 类 |
| 分享海报 | ✅ (默认脱敏) | ✅ | ✅ |
| 无限测算 | ❌ (P1 真限流) | ❌ | ❌ (P1) |

**锁态策略**:
- `report/full.vue` 严格拦截 (防裸访问绕过) — `v-if="!subStore.canViewFull"` 整屏锁
- `report/preview.vue` 软拦截 — 前 2 类 + 1 条建议, 其余 blur
- `dashboard/index.vue` 软拦截 — free 时显示 Pro CTA 卡 + 后 5 类锁
- `actions/index.vue` 软拦截 — free 第 1 条, 其余隐藏 + 解锁 CTA
- `profile/index.vue` 真实订阅状态显示

### 3.6 分享长图 + PDF 导出
- 客户端 Canvas 绘制, **零云算力**
- 字段白名单: `buildShareModel(plan, opts)` 输入完整 plan, 输出仅含允许字段
- 默认脱敏: 不画具体收入/储蓄金额, 比例转为 10 个百分点一档的区间
- 「仅分享分数」开关进一步隐藏城市/阶段/比例
- PDF: 客户端 Canvas 1242×1754 → `canvasToTempFilePath` → `uni.openDocument`, 失败降级为 `saveImageToPhotosAlbum`
- 微信小程序码: `share.getQrCode` 调 `cloud.openapi.wxacode.getUnlimited`, 失败返 placeholder

### 3.7 前端结构
- 新增 `stores/subscription.js` (Pinia) — 单一权威, fail-closed, 并发去重
- 扩展 `services/api.js` 4 个 wrapper
- 新增 `utils/poster.js` + `utils/pdf.js`
- `App.vue#onLaunch` 启动时 `subStore.refresh()`
- `pages/login/index.vue` 用 bootstrap 响应直接 hydrate subscription

---

## 四、测试结果

```
test-engine         29/29 PASS
test-auth           10/10 PASS
test-rules          16/16 PASS
test-tracking       11/11 PASS
test-commercialization 23/23 PASS  (新增: T8-0~T8-12 + 续期 + 越权)
─────────────────────────────────────
Total               89/89 PASS
```

### Phase 8 验收用例

| # | 场景 | 期望 | 状态 |
|---|------|------|------|
| T8-0 | 权益纯函数 (free / pro 未过期 / pro 已过期 / report_once 7d) | 全部正确 | ✅ |
| T8-0b | 续期日期 (report_once 7d / pro 首次 / pro 续费未过期 / pro 续费已过期) | max(now,current)+365d | ✅ |
| T8-1 | `orders.create` 未登录 | 40101 | ✅ |
| T8-2 | `orders.create` 有 user 但无 plan | 40401 | ✅ |
| T8-3 | report_once → mockPay → subscription.get | canViewFull=true, daysRemaining=7 | ✅ |
| T8-4 | 重复调 `orders.mockPay` | 40901 | ✅ |
| T8-5 | 已过期订阅 | canViewFull=false, DB 字段保留 | ✅ |
| T8-6 | Pro 续费 | 新 expires = max(now, current) + 365d (不缩短) | ✅ |
| T8-7 | Pro 覆盖 report_once | 最终 plan_type=pro_yearly, daysRemaining=365 | ✅ |
| T8-8 | 非法 sku (garbage / pro_family) | 40020 INVALID_SKU | ✅ |
| T8-9 | 订单越权 (A 创建, B mockPay) | 40301 | ✅ |
| T8-10 | `share.getQrCode` 本地 | mode=placeholder | ✅ |
| T8-11 | `user.bootstrap` 真读 subscription | 第二次仍 plan_type=free, 付费后 plan_type=report_once | ✅ |
| T8-12 | `subscription.get` 无记录 | 自动写 free, canViewFull=false | ✅ |
| T8-bonus | Pro 状态下 buy report_once | 40921 ALREADY_ENTITLED | ✅ |

---

## 五、文件清单 (Phase 7-8 累计新增)

### Phase 7 (M6)
- `uniapp/cloudfunctions/api/common/db.js` — weekly_entries 5 个新方法 + activatePlan
- `uniapp/cloudfunctions/api/handlers/index.js` — 6 个新 action + 7 类固定索引
- `uniapp/src/services/api.js` — 业务云函数统一入口
- `uniapp/src/stores/plan.js` — 当前方案 store
- `uniapp/src/components/ProgressBar.vue` — 进度条
- `scripts/test-tracking.js` — Phase 7 测试
- `docs/superpowers/specs/2026-07-23-phase-7-budget-tracking-design.md`
- `docs/superpowers/plans/2026-07-24-phase-7-tracking.md`

### Phase 8 (M7, 本次新增)
- `uniapp/cloudfunctions/api/common/response.js` — 新增 5 个错误码
- `uniapp/cloudfunctions/api/common/db.js` — 9 个新方法 (subscriptions / orders / app_config)
- `uniapp/cloudfunctions/api/handlers/index.js` — 4 个新 action + calcEntitlements / computeExpiresAt / SKU_CATALOG
- `uniapp/src/services/api.js` — 4 个新 wrapper
- `uniapp/src/stores/subscription.js` — 订阅 store (新)
- `uniapp/src/utils/poster.js` — 分享长图渲染 (新)
- `uniapp/src/utils/pdf.js` — PDF 导出 (新)
- `uniapp/src/pages/paywall/index.vue` — 重做, Mock 支付闭环
- `uniapp/src/pages/dashboard/index.vue` — 软拦截 + Pro CTA
- `uniapp/src/pages/actions/index.vue` — 软拦截 + 接 active plan
- `uniapp/src/pages/profile/index.vue` — 真实订阅状态
- `uniapp/src/pages/login/index.vue` — bootstrap hydrate subscription
- `uniapp/src/subpackages/report/preview.vue` — 软拦截
- `uniapp/src/subpackages/report/full.vue` — **严格锁态** + PDF 接入
- `uniapp/src/subpackages/report/share.vue` — 重写, Canvas 长图 + 脱敏
- `uniapp/src/App.vue` — onLaunch 拉 subscription
- `scripts/create-collections.js` — 补 3 个集合
- `scripts/seed-prices.js` — price seed (新)
- `scripts/test-commercialization.js` — 23 用例端到端 (新)
- `docs/PHASE-7-8-SUMMARY.md` — 本文档 (新)

---

## 六、剩余 P1 项

| 项 | 说明 | 优先级 |
|----|------|--------|
| 真实 `cloudPay.unifiedOrder` + `payNotify` | 字段已就位, 只需替换 `orders.create` 内部分支与新建 `payNotify` 云函数 | 高 |
| 服务端订阅消息推送 | Phase 7 仅做授权引导, 推送业务留 P1 | 中 |
| 行动清单采纳落库 | 本期不动, 继续 localStorage | 中 |
| `engineClient` 与 `services/api` 收敛 | 双套并存, 全部迁完前不便删除 | 中 |
| 伴侣关联 + 家庭成员 | Phase 10 路径 | 低 |
| 月末复盘 | Phase 10 路径 | 低 |
| 城市扩 20 城 | benchmark seed 扩展 | 低 |
| 真实 DTO 字段裁剪 (后端) | 付费字段裁剪在真支付前必做 | 高 |
| 分享小程序码缓存 (`share_qrcodes` 集合) | 减少 wxacode 配额 | 中 |

---

## 七、下一步 (Phase 9 路径)

按开发计划:
- **Phase 9 (内测 + 质量, M8)**: 50 人内测 + 漏斗埋点 + P0 bug 清零 + 性能优化 + 安全审计
- **Phase 10 (P1 增强)**: 伴侣协同 + 月末复盘 + 订阅消息 + 城市扩展

具体下一步建议:
1. **真支付接缝** — 已预留, 等商户号就绪即可替换
2. **后端 DTO 裁剪** — 真支付前必须做, 防抓包绕过
3. **Phase 9 漏斗埋点** — `track.batch` action 未实现, 需先做
4. **清理 engineClient 双套** — Phase 7 留的 P1, M7 完成后可收口

---

**文档结束**
