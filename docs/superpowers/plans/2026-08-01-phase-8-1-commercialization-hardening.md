# Phase 8.1 商业化与分享链路收口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 8 从 Mock 演示闭环收口为可控内测闭环，修复分享首绘、二维码、Paywall 回跳、订单幂等、结算恢复和误导性入口反馈。

**Architecture:** 保留现有 `handlers/index.js` 与 `common/db.js` 结构，在服务端抽出可被 Mock 支付和未来 `payNotify` 复用的订单结算边界；前端保持现有 Vue/UniApp 页面结构，新增纯函数/小型服务辅助导航和二维码下载。先以本地 memoryStore 测试业务语义，再用构建和云开发桩验证平台路径。

**Tech Stack:** UniApp + Vue 3 `<script setup>`、微信小程序 Canvas、微信云开发 `wx-server-sdk`、Node.js 本地商业化测试脚本、Git。

## Global Constraints

- 本批不接入真实 `cloudPay.unifiedOrder`、`wx.requestPayment` 或生产 `payNotify`。
- 不实现伴侣邀请、家庭版、月末复盘、服务端订阅消息、管理后台和 Phase 9 全量埋点。
- 订单和权益状态由服务端决定；前端不得凭本地状态宣称支付成功。
- Paywall 来源只能使用固定白名单，未知来源默认完整报告，禁止任意 URL 跳转。
- 未接通能力不得显示“已保存”“已提交注销申请”或“已开启提醒”。
- 每个任务先写失败测试，再实现最小改动；每个任务单独提交。

---

### Task 1: 建立可复用的 Paywall 来源映射

**Files:**
- Create: `uniapp/src/utils/paywallRedirect.js`
- Create: `uniapp/scripts/test-paywall-redirect.js`
- Modify: `uniapp/src/pages/paywall/index.vue:1-90`

**Interfaces:**
- Produces `resolvePaywallRedirect(from): string`, accepting any value and returning one of the fixed route strings.
- Routes: `preview` → `/subpackages/report/preview`; `full`/`pdf` → `/subpackages/report/full`; `dashboard` → `/pages/dashboard/index`; `actions` → `/pages/actions/index`; `share` → `/subpackages/report/share`; missing/invalid → `/subpackages/report/full`.

- [ ] **Step 1: Write the failing test**

```js
import { resolvePaywallRedirect } from '../src/utils/paywallRedirect.js'
const cases = [
  ['preview', '/subpackages/report/preview'],
  ['full', '/subpackages/report/full'],
  ['pdf', '/subpackages/report/full'],
  ['dashboard', '/pages/dashboard/index'],
  ['actions', '/pages/actions/index'],
  ['share', '/subpackages/report/share'],
  ['', '/subpackages/report/full'],
  ['https://evil.example', '/subpackages/report/full'],
]
for (const [from, expected] of cases) {
  if (resolvePaywallRedirect(from) !== expected) throw new Error(`${from} mismatch`)
}
console.log('paywall redirect tests passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd uniapp && node scripts/test-paywall-redirect.js`
Expected: FAIL because `paywallRedirect.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
const ROUTES = Object.freeze({
  preview: '/subpackages/report/preview',
  full: '/subpackages/report/full',
  pdf: '/subpackages/report/full',
  dashboard: '/pages/dashboard/index',
  actions: '/pages/actions/index',
  share: '/subpackages/report/share',
})
export function resolvePaywallRedirect(from) {
  return ROUTES[String(from || '')] || ROUTES.full
}
```

In `paywall/index.vue`, import `onLoad` from `@dcloudio/uni-app`, store `from` in a ref, and replace the hardcoded reLaunch URL with `resolvePaywallRedirect(from.value)`.

- [ ] **Step 4: Run test and build**

Run: `cd uniapp && node scripts/test-paywall-redirect.js`; expected PASS. Then run the existing MP-Weixin build command from `uniapp/package.json`; expected exit 0.

- [ ] **Step 5: Commit**

```bash
git add uniapp/src/utils/paywallRedirect.js uniapp/scripts/test-paywall-redirect.js uniapp/src/pages/paywall/index.vue
git commit -m "fix(phase-8.1): preserve paywall source route"
```

---

### Task 2: 修复分享页首绘和二维码下载适配

**Files:**
- Create: `uniapp/src/utils/shareQr.js`
- Create: `uniapp/scripts/test-share-qr.js`
- Modify: `uniapp/src/subpackages/report/share.vue:1-105`
- Modify: `uniapp/src/utils/poster.js` only if the existing input contract requires it

**Interfaces:**
- Produces `resolveQrImage(qr, downloadFile): Promise<string>`; returns a local path for a QR response with `file_id`, returns `''` for placeholder/missing data, and never throws for a failed optional QR download.

- [ ] **Step 1: Write failing tests**

```js
import { resolveQrImage } from '../src/utils/shareQr.js'
const downloaded = await resolveQrImage(
  { mode: 'wxacode', file_id: 'cloud://qr-1' },
  async (fileID) => { if (fileID !== 'cloud://qr-1') throw new Error('wrong id'); return '/tmp/qr.png' },
)
if (downloaded !== '/tmp/qr.png') throw new Error('file id was not downloaded')
const placeholder = await resolveQrImage({ mode: 'placeholder' }, async () => '/tmp/no.png')
if (placeholder !== '') throw new Error('placeholder should stay empty')
const failed = await resolveQrImage({ mode: 'wxacode', file_id: 'cloud://bad' }, async () => { throw new Error('offline') })
if (failed !== '') throw new Error('optional QR failure should degrade')
console.log('share QR tests passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd uniapp && node scripts/test-share-qr.js`; expected FAIL because the helper is absent.

- [ ] **Step 3: Implement helper and page lifecycle**

Implement `resolveQrImage` with an explicit `file_id` check and catch optional download failures. In `share.vue`, inject a platform adapter around `uni.cloud.downloadFile({ fileID })`, set `qrImage.value`, then after `loading` data is ready call `setTimeout(redraw, 0)` (or `nextTick(redraw)`) so Canvas is mounted. Keep `onSave` redraw before export. Set a non-blocking `errorMsg` when QR download fails, but still allow poster generation.

- [ ] **Step 4: Run focused test and static checks**

Run: `cd uniapp && node scripts/test-share-qr.js`; expected PASS. Run `grep -n "redraw" uniapp/src/subpackages/report/share.vue` and confirm the mounted flow contains a call after data loading. Run the project build; expected exit 0.

- [ ] **Step 5: Commit**

```bash
git add uniapp/src/utils/shareQr.js uniapp/scripts/test-share-qr.js uniapp/src/subpackages/report/share.vue
git commit -m "fix(phase-8.1): render share poster on first load"
```

---

### Task 3: 让 wxacode 服务端返回可下载文件

**Files:**
- Modify: `uniapp/cloudfunctions/api/handlers/index.js:844-900`
- Modify: `uniapp/cloudfunctions/api/common/db.js` only for an existing storage helper boundary
- Modify: `uniapp/scripts/test-commercialization.js` to add dependency stubs

**Interfaces:**
- `share.getQrCode` keeps `mode`, `file_id`, `page`, and `scene`; cloud success must return a non-empty `file_id`, while local mode remains a placeholder.

- [ ] **Step 1: Add a failing cloud-path test**

Add a test with a fake `wx-server-sdk` adapter where `getUnlimited` returns a Buffer and `cloud.uploadFile` returns `{ fileID: 'cloud://share-qrcodes/test.png' }`; dispatch `share.getQrCode` and assert `mode === 'wxacode'` and the returned `file_id` equals that value. Keep the existing local placeholder assertion.

- [ ] **Step 2: Run the focused test**

Run: `cd uniapp && node scripts/test-commercialization.js`; expected the new cloud-path assertion to fail because current code returns `file_id: ''`.

- [ ] **Step 3: Implement upload**

After `getUnlimited`, call `cloud.uploadFile({ cloudPath, fileContent: qrRes.buffer })` with a deterministic versioned path based on the page path. Return its `fileID` as `file_id`; do not return raw Buffer as `temp_url`. If upload fails, fall back to the existing placeholder response and log only the error message.

- [ ] **Step 4: Run all commercialization tests**

Run: `cd uniapp && node scripts/test-commercialization.js`; expected all existing and new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add uniapp/cloudfunctions/api/handlers/index.js uniapp/scripts/test-commercialization.js
 git commit -m "feat(phase-8.1): persist generated share QR codes"
```

---

### Task 4: 实现订单创建幂等与响应裁剪

**Files:**
- Modify: `uniapp/cloudfunctions/api/common/db.js:237-262`
- Modify: `uniapp/cloudfunctions/api/handlers/index.js:656-745`
- Modify: `uniapp/scripts/create-collections.js` for the orders index
- Modify: `uniapp/scripts/test-commercialization.js`

**Interfaces:**
- Produces DB helper `getOrderByClientRequest({ openid, clientRequestId }): Promise<object|null>`.
- `orders.create` requires a non-empty bounded `client_request_id`; repeated same-user same-SKU requests return the original order; same key with another SKU returns a validation/conflict error.
- Public order DTO contains only `_id`, `sku`, `amount_fen`, `status`, `created_at`.

- [ ] **Step 1: Add failing tests**

Add tests for: duplicate request returns equal `_id`; same key/different SKU returns conflict; response does not contain `openid`, `out_trade_no`, `wx_transaction_id`, or `client_request_id`; missing request ID returns validation error.

- [ ] **Step 2: Run tests to verify failures**

Run: `cd uniapp && node scripts/test-commercialization.js`; expected the new cases to fail against unconditional order creation and full-document response.

- [ ] **Step 3: Implement lookup and memoryStore parity**

Add a DB query by both fields and a memoryStore loop. Validate request ID length (1–64 characters). On an existing order, compare SKU before returning a sanitized order and payment descriptor. On a DB unique-index collision, re-read the order and apply the same comparison.

- [ ] **Step 4: Add index and DTO helper**

Add the orders compound index `(openid, client_request_id)` using the project’s existing index creation style. Exclude null legacy IDs according to the cloud database’s supported index behavior; if the existing script cannot express sparse uniqueness, use a normalized non-null key field for new orders and document the migration in the script comment. Add a local `publicOrderDto(order)` helper used by all `orders.create` responses.

- [ ] **Step 5: Run tests**

Run `cd uniapp && node scripts/test-commercialization.js` and the project test command. Expected PASS with no regression to T8 scenarios.

- [ ] **Step 6: Commit**

```bash
git add uniapp/cloudfunctions/api/common/db.js uniapp/cloudfunctions/api/handlers/index.js uniapp/scripts/create-collections.js uniapp/scripts/test-commercialization.js
git commit -m "fix(phase-8.1): make order creation idempotent"
```

---

### Task 5: 抽取可恢复的 Mock 订单结算

**Files:**
- Modify: `uniapp/cloudfunctions/api/handlers/index.js:747-842`
- Modify: `uniapp/cloudfunctions/api/common/db.js:278-295` if conditional state updates are needed
- Modify: `uniapp/scripts/test-commercialization.js`

**Interfaces:**
- Produces internal `settlePaidOrder({ order, user, channel, transactionId, paidAt })` used by `orders.mockPay`.
- `pending` settles once; already-paid order with matching `source_order_id` returns existing entitlement; paid order without matching subscription repairs the subscription; no retry extends the same order twice.

- [ ] **Step 1: Add failing tests**

Add tests for: first mock payment grants entitlement; repeating it returns an idempotent result without extending `expires_at`; deleting/missing the subscription after marking order paid and retrying restores it; another user cannot settle the order.

- [ ] **Step 2: Run focused tests**

Run: `cd uniapp && node scripts/test-commercialization.js`; expected the repeat and repair cases to fail because current code rejects every non-pending order.

- [ ] **Step 3: Implement settlement boundary**

Move order validation, payment marking, subscription calculation, and subscription upsert into `settlePaidOrder`. Use the order’s original `paid_at` when present. Before calculating a new expiry, detect a subscription whose `source_order_id` equals this order and return it unchanged. For a paid order with no matching subscription, calculate once from the original order/payment time and upsert it.

- [ ] **Step 4: Preserve future callback compatibility**

Keep the function independent of the Mock action name and accept `channel`/`transactionId`, so a later `payNotify` handler can call it without duplicating entitlement logic. Do not add real payment APIs in this task.

- [ ] **Step 5: Run full test/build verification**

Run the full existing test suite, `cd uniapp && node scripts/test-commercialization.js`, and the MP-Weixin build. Expected exit 0 for each command.

- [ ] **Step 6: Commit**

```bash
git add uniapp/cloudfunctions/api/handlers/index.js uniapp/cloudfunctions/api/common/db.js uniapp/scripts/test-commercialization.js
git commit -m "fix(phase-8.1): make mock settlement recoverable"
```

---

### Task 6: 清理未接通入口的虚假成功提示

**Files:**
- Modify: `uniapp/src/pages/setup-reminder/index.vue:4-31`
- Modify: `uniapp/src/pages/privacy/index.vue:11-27`
- Modify: `uniapp/src/pages/family/index.vue:64-78`
- Create: `uniapp/scripts/test-placeholder-feedback.js`

**Interfaces:**
- Empty `tmplIds` never calls subscription API or writes `subscribe_status`.
- Unimplemented deletion/export/privacy/family-save paths show “功能准备中/尚未接入” feedback and do not mutate persistence state.

- [ ] **Step 1: Add testable pure helpers**

Create a small helper module `uniapp/src/utils/featureAvailability.js` exporting `isSubscribeConfigured(tmplIds)`, `UNAVAILABLE_COPY`, and `canPersistFamilyProfile = false` for this phase. Keep page event code thin and avoid testing `uni` globally.

- [ ] **Step 2: Write failing tests**

```js
import { isSubscribeConfigured, UNAVAILABLE_COPY } from '../src/utils/featureAvailability.js'
if (isSubscribeConfigured([])) throw new Error('empty templates must be unavailable')
if (!UNAVAILABLE_COPY.delete.includes('未')) throw new Error('delete copy must disclose no submission')
console.log('placeholder feedback tests passed')
```

- [ ] **Step 3: Implement page behavior**

When `tmplIds` is empty, show the preparation message and return before `requestSubscribeMessage`; do not set storage. Change privacy deletion confirmation to say no request was submitted and change non-danger items to accurate unavailable copy. Change family `onSave` to stop the loading state and show unavailable feedback without updating `original` or `isDirty`.

- [ ] **Step 4: Run focused tests and build**

Run `cd uniapp && node scripts/test-placeholder-feedback.js`, then the project test command and MP-Weixin build. Expected PASS/exit 0.

- [ ] **Step 5: Commit**

```bash
git add uniapp/src/utils/featureAvailability.js uniapp/scripts/test-placeholder-feedback.js uniapp/src/pages/setup-reminder/index.vue uniapp/src/pages/privacy/index.vue uniapp/src/pages/family/index.vue
git commit -m "fix(phase-8.1): remove misleading unavailable actions"
```

---

### Task 7: 端到端验证与收口记录

**Files:**
- Modify: `uniapp/scripts/test-commercialization.js` only for final assertions if needed
- Create: `docs/PHASE-8.1-SUMMARY.md`

**Interfaces:**
- Produces a release-readiness record listing exact test commands, results, known environment limitations, and remaining Phase 9/10 items.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd uniapp && node scripts/test-commercialization.js
cd uniapp && node scripts/test-paywall-redirect.js
cd uniapp && node scripts/test-share-qr.js
cd uniapp && node scripts/test-placeholder-feedback.js
```

Record actual pass/fail counts; do not infer cloud or device behavior from local tests.

- [ ] **Step 2: Run full project verification**

Run the repository’s documented full test command and the MP-Weixin build command from `uniapp/package.json`. Read the complete output and record any failures.

- [ ] **Step 3: Perform available manual checks**

If cloud credentials and a configured development environment are available, verify wxacode upload/download and Canvas first render. If unavailable, record the exact limitation and leave the acceptance item open.

- [ ] **Step 4: Write the summary**

Create `docs/PHASE-8.1-SUMMARY.md` with sections: completed behaviors, test evidence, unverified cloud/device checks, known limitations, and next actions for real payment/Phase 9. Do not claim real QR scanning or payment success without device/cloud evidence.

- [ ] **Step 5: Commit**

```bash
git add docs/PHASE-8.1-SUMMARY.md uniapp/scripts
git commit -m "docs(phase-8.1): record hardening verification"
```

## Plan Self-Review

- **Spec coverage:** Share first render and QR upload/download are covered by Tasks 2–3; Paywall routing by Task 1; idempotent creation and DTO trimming by Task 4; recoverable settlement by Task 5; truthful unavailable feedback by Task 6; verification and limitations by Task 7.
- **Scope:** Real payment, partner, family SKU, monthly review, notifications, analytics, and administration are explicitly excluded and remain Phase 9/10 work.
- **Placeholder scan:** Task instructions contain no unresolved placeholders or unspecified “appropriate handling” steps; every task names files, interfaces, tests, commands, and commit boundaries.
- **Type consistency:** `resolvePaywallRedirect`, `resolveQrImage`, `getOrderByClientRequest`, `publicOrderDto`, `settlePaidOrder`, and `isSubscribeConfigured` are named consistently across tasks.
- **Known implementation caution:** Before adding a compound unique index, verify the project’s cloud database index API supports the chosen null/legacy-ID behavior; if not, use a non-null normalized key for new orders as specified in Task 4 rather than silently creating a non-unique index.
