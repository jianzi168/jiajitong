# 移除支付/订阅链路 实施计划

> **For agentic workers:** 本计划由控制器在当前会话内联执行（机械删除 + 全量回归），不派发 subagent。

**Goal:** 彻底移除付费订阅/订单/付费墙代码，保留微信订阅消息与分享功能，回归全绿。

**Tech Stack:** Node.js（云函数 + 本地测试）、UniApp/Vue 3、Git。

## Global Constraints

- 只删**付费订阅**（`subscriptions`/`orders`/`paywall`/`mockPay`），**不碰**微信订阅消息（`subscribe_records`/`subscribe.*`）。
- `share.getQrCode`、`users.exportData`/`users.deleteMe` 保留，仅去 subscription 相关字段/级联。
- `RATE_LIMITED` 错误码保留（feedback 用）；`app_config` 保留（订阅消息模板 ID 用）。
- 每个任务改完跑对应测试；最终跑全量回归 + 构建验证。

---

### Task 1: 后端 `handlers/index.js` 移除付费 action 与辅助函数

**Files:** `uniapp/cloudfunctions/api/handlers/index.js`

**改动点：**
- 删 `SKU_CATALOG`、`calcEntitlements`、`computeExpiresAt`（约 L86-124）
- 删 `subscriptionGetEffective`、`countPlansThisMonth`（L263-292）
- 删 `subscriptionGet`（L690-740）
- 删 orders 段：`publicOrderDto`/`ordersCreateOk`/`CLIENT_REQUEST_ID_MAX`/`findMemoryOrderByClientRequest`/`ordersCreate`（L748-890）、`ORDER_TERMINAL_STATUS`/`findMemorySubscriptionBySourceOrder`/`subscriptionSettleDto`/`settlePaidOrder`（L896-1073）、`ordersMockPay`（L1076-1121）
- `userBootstrap`：删 Phase 8 订阅读取块（L234-249），返回值去掉 `subscription`
- `plansSave`：删免费限流块（L313-321）
- `usersExportData`：内存路径删 subscription（L1840-1843 + 返回字段）
- `usersDeleteMe`：内存路径删 subscriptions/orders 级联（L1893-1900）
- `memoryStore`：删 `subscriptions`/`orders`（L65-67）
- `_resetMemory`：删对应 clear
- 测试 helper：删 `_seedSubscription`/`_seedOrder`/`_allOrders`/`_clearSubscriptions`
- `module.exports`：删 `'subscription.get'`/`'orders.create'`/`'orders.mockPay'`/`calcEntitlements`/`computeExpiresAt`/`SKU_CATALOG`/`settlePaidOrder`

### Task 2: 后端 `common/db.js` 移除 subscriptions/orders 方法

**Files:** `uniapp/cloudfunctions/api/common/db.js`

**改动点：** 删 `countPlansThisMonth`、`getSubscriptionByFamily`、`getSubscriptionBySourceOrder`、`upsertSubscription`、`getActiveSubscription`、`createOrder`、`getOrder`、`getOrderByClientRequest`、`markOrderPaid`；`exportUserData`/`deleteUserData` 去 subscription/orders；`module.exports` 同步。**保留** `isDuplicateKeyError`（family_invites/family_members 用）。

### Task 3: 后端 `common/response.js` 移除付费错误码

**Files:** `uniapp/cloudfunctions/api/common/response.js`

**改动点：** 删 `INVALID_SKU`(40020)、`MOCK_PAYMENT_DISABLED`(40302)、`ORDER_STATUS_INVALID`(40901)、`ALREADY_ENTITLED`(40921)。保留 `RATE_LIMITED`/`SUBSCRIBE_*`/`QR_CODE_FAILED`。

### Task 4: 前端 `services/api.js` + `services/session.js`

**Files:** `uniapp/src/services/api.js`, `uniapp/src/services/session.js`

**改动点：**
- api.js：删 `createOrder`/`mockPayOrder`/`getSubscription` 导出 + default 条目（L88-92 + L136-138）
- session.js：删 `useSubscriptionStore` import、`buildEntitlements`、`clearLocalSession` 里的 store clear、`applyProfile` 里的 subscription 水合块

### Task 5: 删除 3 个文件 + 修 6 个页面消费者

**Files（删）:** `uniapp/src/stores/subscription.js`、`uniapp/src/pages/paywall/index.vue`、`uniapp/src/utils/paywallRedirect.js`
**Files（改）:** `profile/index.vue`、`dashboard/index.vue`、`actions/index.vue`、`report/preview.vue`、`report/full.vue`、`report/share.vue`

**改动点：** 移除 `useSubscriptionStore` import + `subStore` + `subStore.refresh()`；preview.vue 的 `canViewFull` 截断逻辑简化为全量；dashboard 的 `Promise.all` 去掉 `subStore.refresh()`。

### Task 6: `utils/pdf.js` 去 `canExportPdf` 门槛

**Files:** `uniapp/src/utils/pdf.js`

**改动点：** `exportReportPdf(plan, sub)` → `exportReportPdf(plan)`，删 NEED_PRO 门槛与 JSDoc 中的 `{ canExportPdf }` 示例。

### Task 7: 脚本清理

**Files（删）:** `scripts/test-commercialization.js`、`scripts/seed-prices.js`
**Files（改）:** `scripts/test-security.js`（authActions 去掉 3 个付费 action、更新计数、删 S-5 orders.create 测试）、`scripts/create-collections.js`（删 subscriptions/orders 集合 + 索引 + `backfillOrderRequestKey`）

### Task 8: 全量回归 + 构建验证 + 提交

**验证：**
```bash
cd uniapp && node --test ../scripts/test-api.js ../scripts/test-engine.js ../scripts/test-rules.js ../scripts/test-auth.js ../scripts/test-invite.js ../scripts/test-tracking.js ../scripts/test-security.js
npm run build:mp-weixin
```
确认无引用残留：`grep -rn "useSubscriptionStore\|orders\.\|subscription\.get\|mockPay\|paywall" uniapp/src uniapp/cloudfunctions/api scripts` 应仅命中 `subscribe.*`（订阅消息）与注释。

**提交：** 分任务提交，结尾带 `Co-Authored-By: Claude <noreply@anthropic.com>`。
