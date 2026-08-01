# Phase 8.1 商业化硬化 — 收口记录

> 分支: `feature/phase-8-commercialization`
> 基线: `384d48fe` (main)，父提交: `5afcf9e` (Task 6)
> 收口提交: Task 7 (本文件)
> 设计: `docs/PHASE-8.1-HARDENING-PLAN.md`
> 任务卡: `.superpowers/sdd/2026-08-01-phase-8-1-commercialization-hardening/task-*.md`

---

## 1. 已完成行为（对应 Task 1–6）

### Task 1 — Paywall 来源映射 (`894a405`)

- `uniapp/src/utils/paywallRedirect.js` 新增 `resolvePaywallRedirect(from)`：把上游页面映射到 paywall 的 `source` 参数，缺省 `other`。
- `uniapp/src/pages/paywall/index.vue` 在 onLoad 接 `source` 并回填到购买/关闭按钮，登录成功后 `redirectBack(source)` 把用户带回原入口。
- 测试: `uniapp/scripts/test-paywall-redirect.js`（paywall redirect tests passed）。

### Task 2 — 分享页首绘 + QR 适配 (`57689c2`)

- `uniapp/src/subpackages/report/share.vue` onLoad 即触发首帧渲染（不等 onReady），二维码在状态稳定后异步替换。
- `uniapp/src/utils/shareQr.js` 新增 `resolveQrImage(env)`：识别 placeholder / wxacode / cloud file_id 三种模式，返回 Canvas 友好形态。
- 测试: `uniapp/scripts/test-share-qr.js`（share QR tests passed）。

### Task 3 — wxacode 云端上传 (`f98366a`)

- `scripts/_wx_server_sdk_fake.js` + `scripts/_share_qr_cloud_driver.js` 模拟 `cloud://` 文件存储与 uploadFile，让本地测试不依赖真实云。
- `uniapp/cloudfunctions/api/handlers/index.js` 的 `share.getQrCode`：缺 server SDK → placeholder；有 SDK → `getUnlimitedQRCode` + `uploadFile` → 返回 `fileID`。
- 测试: `scripts/test-commercialization.js` 新增 `T8-13 share.getQrCode 云端 wxacode + upload` 用子进程覆盖云端分支。

### Task 4 — 订单幂等 + DTO 裁剪 (`651a6c5`)

- `orders.create` 要求非空 1-64 字符串 `client_request_id`，按 `(openid, client_request_id)` 查重：同 SKU 命中直接返回原订单（200 + 同一 `_id`），不同 SKU 报 40010。
- `publicOrderDto` 只下发 `_id/sku/amount_fen/status/created_at`，不再泄漏 `openid/out_trade_no/wx_transaction_id/client_request_id`。
- 顺带修 `memoryStore` 版 `plans.save` 同毫秒撞 `_id` 的问题。
- `scripts/create-collections.js` 新增 `backfillOrderRequestKey`：把存量订单回填 `client_request_key`（缺省退化为 `_id`），再建 `(openid, client_request_key)` 唯一索引兜底并发。
- 测试: `T8-14/T8-14b/T8-14c`（幂等 + 校验 + DTO 裁剪 + 用裁剪后 DTO 闭环 mockPay）。

### Task 5 — Mock 结算可恢复 (`2bdebe7`)

- `orders.mockPay` 重写：用原始 `paid_at + duration` 重建 `expires_at`，**不依赖**现有 subscription 记录；订阅丢失 / 懒写 free 记录都被视为"未命中"并修复；续费时取 `max(now, current)` 防重叠；他人订单或已 paid 重放直接 40301。
- 测试: `T8-15/T8-15b..f`（首次发放 / 重放幂等 / 订阅丢失修复 / 懒写不算命中 / 越权拒绝 / 不影响后续真实续费 / 重放旧订单不叠周期）。

### Task 6 — 占位反馈真实化 (`5afcf9e`)

- `uniapp/src/utils/featureAvailability.js` 新增 `isSubscribeConfigured()`：真读云端 `app_config.is_subscribe_configured`，未配置时返回 false。
- `uniapp/src/pages/family/index.vue`、`privacy/index.vue`、`setup-reminder/index.vue` 移除"看起来可点、点了无反应"的按钮和入口，统一改为 disabled + 文案。
- 测试: `uniapp/scripts/test-placeholder-feedback.js`（placeholder feedback tests passed）。

---

## 2. 测试与构建证据

### 2.1 四个聚焦测试

```text
$ node /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/scripts/test-paywall-redirect.js
paywall redirect tests passed
EXIT=0

$ node /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/scripts/test-share-qr.js
share QR tests passed
EXIT=0

$ node /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/scripts/test-placeholder-feedback.js
placeholder feedback tests passed
EXIT=0

$ node /Users/jianzi/dev/workspace/jiajitong_v2/scripts/test-commercialization.js
...
ℹ tests 44
ℹ suites 20
ℹ pass 44
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 88.53925
EXIT=0
```

四个测试全绿，44 用例 0 失败。

### 2.2 完整项目测试 (`npm test`)

`uniapp/package.json` 实际命令：

```text
node --test ../scripts/test-engine.js ../scripts/test-api.js ../scripts/test-rules.js ../scripts/test-auth.js
```

执行：

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && npm test
```

输出尾部（最后 20 行原文）：

```text
  ✔ 7 个 categories 必有 (0.075625ms)
  ✔ categories 合计 ≈ disposable × 0.95 (0.0525ms)
  ✔ disposable ≈ 0 → categories 不崩 (0.121375ms)
  ✔ plan_id 是 uuid (0.127459ms)
✔ calcFull (8.659333ms)
▶ normalize
  ✔ disposable=0 → 所有 suggested=0 (0.044542ms)
  ✔ range 是 suggested 的 0.75-1.25 倍 (0.025292ms)
✔ normalize (0.101584ms)
▶ 性能门禁
  ✔ 10 城 × 100 次 calcQuick 平均 < 50ms (1.052584ms)
✔ 性能门禁 (1.072125ms)
▶ R01-R07 通用规则
  ✔ R01 储蓄率 < 20% 触发 (9.661208ms)
  ✔ R02 固定占比 > 50% 触发 (0.189792ms)
  ✔ R03 应急金 < 3 月触发 (0.093208ms)
  ✔ R04 餐饮超上限触发 (0.068625ms)
  ✔ R07 备用金过剩 > 12 触发 (0.06925ms)
✔ R01-R07 通用规则 (10.453459ms)
▶ R-N01-N07 备育规则
  ✔ R-N01 备育储备压力大 → 红字 (0.1835ms)
  ✔ R-N03 备育+储蓄 < 15% 触发 (0.07825ms)
  ✔ R-N04 房贷 > 45% 触发 (0.069708ms)
  ✔ R-N05 备育+应急金 < 3 月触发 (0.090667ms)
  ✔ R-N06 备育+医疗偏低触发 (0.097ms)
  ✔ 新婚阶段不触发 R-N01 (0.083375ms)
  ✔ R-N07 MVP 不触发 (0.058541ms)
✔ R-N01-N07 备育规则 (0.777208ms)
▶ 排序 + Top 5
  ✔ 输出按 score 降序 (0.097917ms)
  ✔ 最多 5 条 (0.060375ms)
  ✔ 晓雯家庭触发 ≥3 条 (0.048208ms)
✔ 排序 + Top 5 (0.270833ms)
▶ rules 引擎直接调用
  ✔ 返回数组 (0.042208ms)
✔ rules 引擎直接调用 (0.063375ms)
ℹ tests 70
ℹ suites 24
ℹ pass 70
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 57.779583
```

EXIT=0。70 / 70 通过。

### 2.3 MP-Weixin 构建 (`npm run build:mp-weixin`)

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && npm run build:mp-weixin
```

输出尾部（原文）：

```text
> jiajitong@1.0.0 build:mp-weixin
> uni build -p mp-weixin

正在编译中...

uni-app 有新版本发布，请执行 `npx @dcloudio/uvm@latest` 更新，更新日志详见：https://download1.dcloud.net.cn/hbuilderx/changelog/5.15.2026070915.html
DONE  Build complete.
运行方式：打开 微信开发者工具, 导入 dist/build/mp-weixin 运行。
```

EXIT=0。Build complete。

### 2.4 `test-tracking.js`（记录，不修）

```bash
node /Users/jianzi/dev/workspace/jiajitong_v2/scripts/test-tracking.js
```

尾部原文：

```text
ℹ tests 15
ℹ suites 7
ℹ pass 12
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18.473042

✖ failing tests:

test at scripts/test-tracking.js:51:3
✖ 完整链路 (11.881875ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
    assert.ok(dashData.totals.used > 0)

test at scripts/test-tracking.js:126:3
✖ getMonthlyEntries 只返回本月 week_start 的 entries (0.327ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
    assert.ok(food.used >= 80)

test at scripts/test-tracking.js:225:3
✖ totals.pct 不会越界 (>100 时 clamp 到 100) (0.346625ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  'green' !== 'red'
```

EXIT=1。三条 pre-existing 失败：完整链路断言、`getMonthlyEntries` 月内聚合、`totals.pct` clamp。Phase 7 时期即存在，与 Phase 8.1 硬化无关，本任务不修。

### 2.5 `create-collections.js`（未执行真实云）

脚本需要 `<envId>` 参数和 `wx-server-sdk`（仅在微信开发者工具运行时可用）。本地直接调用：

```text
$ node scripts/create-collections.js
初始化失败: Error: Cannot find module 'wx-server-sdk'
Require stack:
- /Users/jianzi/dev/workspace/jiajitong_v2/scripts/create-collections.js
    at Module._resolveFilename ...
EXIT=1
```

符合预期：本地环境无 `wx-server-sdk`、也无云端 envId，**未执行真实云回填与索引创建**。详见 §3 / §4。

---

## 3. 未在真实云/真机验证的项目

| 项目 | 现状 | 验证方式（需要） |
|---|---|---|
| `wxacode.getUnlimited` 真实云端返回 + `uploadFile` 落盘 | 本地测试用 `_wx_server_sdk_fake.js` + `_share_qr_cloud_driver.js` 模拟；测试断言的是"在 cloud 模式下拿到 `cloud://...` 形态的 file_id" | 在微信开发者工具上传并调用 `share.getQrCode`，比对返回的 `fileID` 是否可被 `wx.cloud.downloadFile` 拉回 |
| 二维码扫描真机落点 | 真机扫码 → 打开小程序的链路未在本环境验证 | 真机或开发者工具"预览"扫码 → 验证 URL 拼接规则、scene 解析 |
| Canvas 真机绘制 share poster | 本地测试覆盖的是"QR 适配与状态切换"，Canvas API 在不同机型的成功率未覆盖 | 微信开发者工具真机预览，多机型（iOS / Android）目视确认 |
| `orders.create` 的真实云数据库唯一索引兜底 | 真实云 `(openid, client_request_key)` 索引尚未在 env 创建（见 §4） | 在 env 跑 `create-collections.js`，并发提交同 `client_request_id`，观察 set 撞唯一键回读 |

---

## 4. 已知限制

1. **`scripts/test-tracking.js` 三条 pre-existing 失败**
   - `完整链路`、`getMonthlyEntries`、`totals.pct clamp`。
   - 来源：Phase 7 期间已存在，与 Phase 8.1 无关，本任务不修复。
   - 后续：纳入 Phase 9 跟踪项。

2. **`create-collections.js` 真实云回填未执行**
   - 本环境无 `wx-server-sdk` 且无 envId，§2.5 仅验证失败模式。
   - `(openid, client_request_key)` 唯一索引、Phase 8 其他索引、Phase 9 预留集合均未在真实云环境落库。
   - 上线前必须在目标 env 执行一次：
     ```
     node scripts/create-collections.js <envId>
     ```

3. **`source_order_id` 索引未加**
   - Task 1 的 `paywall.source` 字段（用于回跳）在 `orders` 集合上未建立索引。
   - 现状：单户订单量小，全表扫可接受；订单量增长后再追加。
   - 后续：在 `create-collections.js` 中追加 `safeCreateIndex(db, 'orders', 'source_openid_created', { source: 1, openid: 1, created_at: -1 })`。

4. **`client_request_id` 必填对旧客户端的破坏性**
   - Task 4 之后，`orders.create` 强制 `client_request_id` 非空且 1-64 字符。
   - Phase 8.1 之前的客户端（如果已在野）会被服务端直接拒为 40010。
   - 现状：Phase 8 客户端与 Phase 8.1 同批上线，没有"老客户端"在野。
   - 后续：若出现灰度场景，需在 `orders.create` 顶部加一段"读不到 client_request_id 时用随机 UUID 自填"的兼容逻辑，并在响应里带回。

---

## 5. 下一阶段

### Phase 8.2（真支付 + 真 wxacode）

- 接入真实微信支付 `wxpay.unifiedOrder` + 回调，落库 `out_trade_no` 与 `wx_transaction_id`。
- 把 `_wx_server_sdk_fake.js` 撤掉，恢复"真 SDK 才返回真 fileID"的分支判断。
- 在测试 env 跑 `create-collections.js` 真实回填 + 建索引。

### Phase 9（内测 + 埋点）

- `analytics_events` 集合打通：付费漏斗（paywall_view → buy_click → create_order → mockpay / wxpay → subscription_activated）。
- `recommendation_status` 的 P1 规则落实（与硬化的"无方案引导"对齐）。
- 三条 `test-tracking` 失败的根因排查。

### Phase 10（伴侣与月末复盘）

- `family_members` / `family_invites` 落地，伴侣可加入同户。
- 月末复盘报告（`analytics_events` 聚合 + `weekly_entries` 月内汇总）。

---

## 6. 提交索引（按提交顺序列出 6 个 commit）

| 序 | full hash | subject |
|---|---|---|
| 1 | `894a4055fb27caae056e9e4dac352fe41b23cd49` | fix(phase-8.1): preserve paywall source route |
| 2 | `57689c2e63d50034508527fd4f80f1a914471037` | fix(phase-8.1): render share poster on first load |
| 3 | `f98366a77ec07f6212ade1608930ee6f88f4b913` | feat(phase-8.1): persist generated share QR codes |
| 4 | `651a6c587dc94e1f190935a2505af1cc40a7cd6c` | fix(phase-8.1): make order creation idempotent |
| 5 | `2bdebe75a92cbacc291199e495c128e2cad1a9a8` | fix(phase-8.1): make mock settlement recoverable |
| 6 | `5afcf9e479922c654800778ec07e2fd6a605431c` | fix(phase-8.1): remove misleading unavailable actions |

文档与计划：

- `5df485e0390e25a7a16164b4255345871b53257e` — docs(phase-8.1): add hardening implementation plan
- Task 7（本文档，待提交） — docs(phase-8.1): record hardening verification