# 移除支付/订阅（商业化）链路 — 设计

**日期**：2026-08-22
**分支**：`feature/phase-8-commercialization`
**状态**：已批准（用户选择「彻底移除支付/订阅链路」）

## 背景

商业化（付费订阅 + mock 支付 + 付费墙）处于「前端显示全量开放、后端仍按订阅鉴权」的不一致态。用户决定彻底移除，不做支付。

## 范围：删 vs 留（关键区分）

代码里有**两个「订阅」**，只删付费那个：

### 删除（付费订阅 / 订单 / 付费墙）

**后端 action**：`subscription.get` / `orders.create` / `orders.mockPay`
**后端辅助**：`SKU_CATALOG` / `calcEntitlements` / `computeExpiresAt` / `settlePaidOrder` / `subscriptionGetEffective` / `countPlansThisMonth`
**免费用户月度限流**：`plans.save` 的「1 次/月」限流（纯为促升级，无升级路径后变纯摩擦 → 移除）
**db 方法**：subscriptions / orders 全部方法（`getSubscriptionByFamily` / `upsertSubscription` / `getActiveSubscription` / `getSubscriptionBySourceOrder` / `createOrder` / `getOrder` / `getOrderByClientRequest` / `markOrderPaid` / `countPlansThisMonth`）
**集合**：`subscriptions` / `orders`（`create-collections.js` 中移除 + 对应索引 + `backfillOrderRequestKey`）
**错误码**：`INVALID_SKU`(40020) / `MOCK_PAYMENT_DISABLED`(40302) / `ORDER_STATUS_INVALID`(40901) / `ALREADY_ENTITLED`(40921)
**前端文件**：`stores/subscription.js`（删）/ `pages/paywall/index.vue`（删，已在 pages.json 未注册）/ `utils/paywallRedirect.js`（删）
**前端引用**：`services/api.js` 的 `createOrder`/`mockPayOrder`/`getSubscription`；6 个页面 + `session.js` 对 `useSubscriptionStore` 的引用
**报告页付费截断**：`preview`/`full`/`share` 的 `subStore.canViewFull` 分支、`FREE_VISIBLE_*` 常量、baby 摘要截断
**脚本**：`test-commercialization.js`（删）/ `seed-prices.js`（删）

### 保留（与支付无关）

- **微信订阅消息**：`subscribe_records` 集合 + `subscribe.record/getStatus/send/remindWeekly` — Phase 10 周提醒推送，独立功能
- **`share.getQrCode`**：分享海报小程序码
- **`users.exportData` / `users.deleteMe`**：数据可携带/注销（仅去掉 subscription 字段与级联）
- **`app_config`**：订阅消息模板 ID 仍用（`getWeeklyTemplateId`）
- **`RATE_LIMITED`(42901)**：`feedback.submit` 限流仍用

## 关键决策

1. **免费用户月度限流一并移除**：无 Pro 升级路径后，限流变成纯摩擦，用户应可无限次重算。
2. **`exportData`/`deleteMe` 不再导出/级联 subscriptions/orders**。
3. **`user.bootstrap` 响应不再返回 `subscription` 字段**（`session.applyProfile` 同步去掉 subscription 水合）。
