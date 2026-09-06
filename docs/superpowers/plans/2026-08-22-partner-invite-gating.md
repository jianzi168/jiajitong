# 伴侣已加入时禁用「生成邀请码」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 伴侣已加入后，前端禁用「生成邀请码」按钮并收起邀请卡；后端 `families.inviteCreate` 在家庭已有成员时拒绝，防止绕过 UI。

**Architecture:** 沿用现有 `handlers/index.js` 结构，抽取 `listFamilyMembers` 公共函数并在 `inviteCreate` 加成员数拦截（新错误码 `FAMILY_ALREADY_PAIRED`）；前端新增纯函数 `resolveInviteAreaState` 收敛三分支决策，模板按返回值渲染，`onInvite` 捕获后端拦截错误刷新成员列表。先以 memoryStore 本地测试验证业务语义，再构建验证平台产物。

**Tech Stack:** UniApp + Vue 3 `<script setup>`、微信云开发 `handlers/index.js`、Node.js 本地测试脚本、Git。

## Global Constraints

- 家庭满员语义 = 成员数 > 0（owner + 1 伴侣）；`getMembers` 的 `members` 即伴侣。
- 新错误码固定为 `FAMILY_ALREADY_PAIRED: 41008`，加在 `common/response.js` Phase 10 错误块。
- 后端拦截放在 `requireOwner` 之后、创建邀请之前；非 owner 行为不变。
- 前端三分支由纯函数 `resolveInviteAreaState(hasPartner, inviteCode)` 驱动，模板不写散乱条件。
- 不改变 cloud DB schema、不新增集合、不新增第三方依赖。
- 每个任务先写失败测试（前端纯函数 / 后端 handler 用例），再实现最小改动；每个任务单独提交。

---

### Task 1: 后端拦截 — `FAMILY_ALREADY_PAIRED` + `listFamilyMembers` 抽取 + `inviteCreate` 守卫

**Files:**
- Modify: `uniapp/cloudfunctions/api/common/response.js:33`（Phase 10 错误块加一行）
- Modify: `uniapp/cloudfunctions/api/handlers/index.js:1196-1238`（`familiesInviteCreate` 加守卫）、`1346-1391`（`familiesGetMembers` 改用抽取的函数）
- Test: `scripts/test-invite.js`（主 `test` 块内 I-10 之后、块闭合 `})` 之前插入 I-11/I-12）

**Interfaces:**
- Consumes: `db.getFamilyMembers(familyId)`（`common/db.js` 已导出）、`memoryStore.family_members`。
- Produces: `listFamilyMembers(familyId): Promise<Array>`（cloud 走 `db.getFamilyMembers`，memory 遍历过滤）；`ERROR_CODE.FAMILY_ALREADY_PAIRED = 41008`；`families.inviteCreate` 在成员数 > 0 时返回 `{ code: 41008, message: 'FAMILY_ALREADY_PAIRED', userHint: '伴侣已加入，无需再生成邀请码' }`。

- [ ] **Step 1: 写失败测试（I-11 拦截 / I-12 空家庭回归）**

在 `scripts/test-invite.js` 的 I-10 之后、主测试块闭合 `})` 之前追加：

```js
  await t.test('I-11 家庭已有伴侣后不能再生成邀请码', async () => {
    await h['user.bootstrap'](fakeCtx('userA'), { nickname: '晓雯' })
    const invRes = await h['families.inviteCreate'](fakeCtx('userA'), {})
    assert.equal(invRes.code, 0, '先创建一次邀请')
    await h['user.bootstrap'](fakeCtx('userB'), { nickname: '阿哲' })
    const joinRes = await h['families.inviteJoin'](fakeCtx('userB'), { invite_code: invRes.data.invite_code })
    assert.equal(joinRes.code, 0, '伴侣应加入成功')

    // owner 再次生成邀请码 → 被拦截
    const again = await h['families.inviteCreate'](fakeCtx('userA'), {})
    assert.equal(again.code, 41008, '家庭已有伴侣应返回 41008')
  })

  await t.test('I-12 成员为空时可正常生成邀请码（回归）', async () => {
    await h['user.bootstrap'](fakeCtx('userA'), { nickname: '晓雯' })
    const res = await h['families.inviteCreate'](fakeCtx('userA'), {})
    assert.equal(res.code, 0, '空家庭不应被新守卫误拦')
    assert.ok(res.data.invite_code, '应返回 invite_code')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/jianzi/dev/workspace/jiajitong_v2 && node --test scripts/test-invite.js`
Expected: I-11 失败（`again.code` 是 0 而非 41008）；I-12 通过。

- [ ] **Step 3: 实现 — 错误码 + 公共函数 + 守卫**

3a. `uniapp/cloudfunctions/api/common/response.js`，在 Phase 10 订阅消息块前加一行：

```js
  CANNOT_JOIN_OWN:     41005,
  FAMILY_ALREADY_PAIRED: 41008, // 家庭已有伴侣，不能再生成邀请码
```

3b. `uniapp/cloudfunctions/api/handlers/index.js`，在 `familiesGetMembers` 之前新增公共函数：

```js
// 列出某家庭所有成员（cloud 走 db，memory 遍历过滤）
async function listFamilyMembers(familyId) {
  if (usingCloudDb) {
    return await db.getFamilyMembers(familyId)
  }
  const fm = memoryStore.family_members || new Map()
  const members = []
  for (const [, v] of fm) {
    if (v && v.family_id === familyId) members.push(v)
  }
  return members
}
```

3c. `familiesInviteCreate` 内 `const ownerErr = requireOwner(user); if (ownerErr) return ownerErr` 之后、`let invite` 之前插入：

```js
  // 家庭已有伴侣（成员）时不能再生成邀请码（防绕过 UI）
  const members = await listFamilyMembers(user.family_id)
  if (members.length > 0) {
    return fail(ERROR_CODE.FAMILY_ALREADY_PAIRED, 'FAMILY_ALREADY_PAIRED', '伴侣已加入，无需再生成邀请码')
  }
```

3d. `familiesGetMembers` 内替换原有成员查询为公共函数：

```js
  let members = await listFamilyMembers(user.family_id)
```

（删除原来 cloud/memory 两份分支查询，约 6 行。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/jianzi/dev/workspace/jiajitong_v2 && node --test scripts/test-invite.js`
Expected: `pass` 为原有用例数 + 2（I-11、I-12 全绿），`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add uniapp/cloudfunctions/api/common/response.js uniapp/cloudfunctions/api/handlers/index.js scripts/test-invite.js
git commit -m "feat(phase-10): block inviteCreate when family already paired"
```

---

### Task 2: 前端纯函数 `resolveInviteAreaState` + 单测

**Files:**
- Create: `uniapp/src/utils/partnerInvite.js`
- Create: `uniapp/scripts/test-partner-invite-state.js`

**Interfaces:**
- Produces: `INVITE_AREA`（`{ JOINED: 'joined', INVITE_CARD: 'invite-card', GENERATE: 'generate' }`，Object.freeze）；`resolveInviteAreaState(hasPartner: boolean, inviteCode: string|null) => 'joined' | 'invite-card' | 'generate'`。`hasPartner` 优先：`true` → `joined`；否则 `inviteCode` 真值 → `invite-card`；否则 `generate`。
- Consumed by: Task 3 的 `partner/index.vue`。

- [ ] **Step 1: 写失败测试**

创建 `uniapp/scripts/test-partner-invite-state.js`：

```js
import { resolveInviteAreaState, INVITE_AREA } from '../src/utils/partnerInvite.js'
const cases = [
  [true, null, INVITE_AREA.JOINED],      // 已加入, 无论有无码
  [true, 'ABC123', INVITE_AREA.JOINED],
  [false, 'ABC123', INVITE_AREA.INVITE_CARD], // 未加入但有码
  [false, null, INVITE_AREA.GENERATE],   // 未加入无码
  [false, '', INVITE_AREA.GENERATE],
]
for (const [hasPartner, inviteCode, expected] of cases) {
  const got = resolveInviteAreaState(hasPartner, inviteCode)
  if (got !== expected) throw new Error(`resolveInviteAreaState(${hasPartner}, ${inviteCode}) = ${got}, want ${expected}`)
}
console.log('partner invite state tests passed')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && node scripts/test-partner-invite-state.js`
Expected: FAIL（`Cannot find module '../src/utils/partnerInvite.js'`）。

- [ ] **Step 3: 实现纯函数**

创建 `uniapp/src/utils/partnerInvite.js`：

```js
/**
 * 邀请区状态判定（伴侣已加入时禁用「生成邀请码」）
 *
 * 把「伴侣已加入 → 禁用 / 有邀请码 → 邀请卡 / 否则 → 生成按钮」
 * 收敛成一个纯函数，便于单测 + 模板按返回值分支。
 */
export const INVITE_AREA = Object.freeze({
  JOINED: 'joined',            // 伴侣已加入: 禁用按钮 + 提示, 邀请卡收起
  INVITE_CARD: 'invite-card',  // 已生成邀请码: 显示邀请卡
  GENERATE: 'generate',        // 未加入未生成: 可点击生成按钮
})

export function resolveInviteAreaState(hasPartner, inviteCode) {
  if (hasPartner) return INVITE_AREA.JOINED
  if (inviteCode) return INVITE_AREA.INVITE_CARD
  return INVITE_AREA.GENERATE
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && node scripts/test-partner-invite-state.js`
Expected: `partner invite state tests passed`。

- [ ] **Step 5: 提交**

```bash
git add uniapp/src/utils/partnerInvite.js uniapp/scripts/test-partner-invite-state.js
git commit -m "feat(phase-10): add resolveInviteAreaState pure function + tests"
```

---

### Task 3: 页面接入 — 三分支模板 + 竞态处理 + 样式 + 构建验证

**Files:**
- Modify: `uniapp/src/pages/partner/index.vue`（script setup + 模板邀请区 + style）
- 验证产物: `uniapp/dist/dev/mp-weixin/pages/partner/index.wxml`、`uniapp/dist/build/mp-weixin/pages/partner/index.wxml`

**Interfaces:**
- Consumes: `resolveInviteAreaState`（Task 2）、现有 `partner` / `inviteCode` / `inviteExpires` / `countdownStr` ref。
- Produces: `hasPartner`（computed）、`areaState`（computed）；`onInvite` 捕获 `e.code === 41008` 时刷新成员列表。

- [ ] **Step 1: script 部分 — 引入 + computed + 竞态常量**

`uniapp/src/pages/partner/index.vue` 的 `<script setup>` 顶部 import 加一行：

```js
import { resolveInviteAreaState } from '@/utils/partnerInvite'
```

在 `const partner = ref(null)` 之后加：

```js
// 伴侣已加入 → 邀请区切换到禁用态
const ERR_FAMILY_ALREADY_PAIRED = 41008 // 与后端 response.js 一致
const hasPartner = computed(() => !!partner.value)
const areaState = computed(() => resolveInviteAreaState(hasPartner.value, inviteCode.value))
```

`onInvite` 的 catch 改为先处理竞态（`loadMembers` 已在下方定义，函数声明提升可用）：

```js
  } catch (e) {
    if (e.code === ERR_FAMILY_ALREADY_PAIRED) {
      // 竞态: 加载后伴侣才加入 → 刷新成员, 自动切到已加入态
      await loadMembers()
      return
    }
    errorMsg.value = e.userHint || e.message || '创建邀请失败，请重试'
    console.error('[partner] createInvite failed:', e)
  } finally {
```

- [ ] **Step 2: 模板邀请区改三分支**

把当前 `<!-- 已生成邀请码 --> <view v-if="inviteCode" class="invite-card">…</view>` + `<!-- 未生成 --> <view v-else>…</view>` 整体替换为：

```html
      <!-- ① 伴侣已加入: 禁用按钮 + 提示, 邀请卡自动收起 -->
      <view v-if="areaState === 'joined'" class="invite-cta">
        <button class="grad-btn grad-btn-disabled" disabled>生成邀请码</button>
        <text class="hint-text hint-text-center invite-full-hint">✓ 伴侣已加入，无需再生成邀请码</text>
      </view>

      <!-- ② 已生成邀请码 -->
      <view v-else-if="areaState === 'invite-card'" class="invite-card">
        <text class="invite-label">邀请码</text>
        <view class="invite-code-row">
          <text class="invite-code">{{ inviteCode }}</text>
          <view class="invite-copy-btn" @tap="onCopyCode">复制</view>
        </view>
        <text class="invite-expires" v-if="inviteExpires">
          ⏰ {{ formatExpires(inviteExpires) }}
          <text class="invite-countdown">（剩余 {{ countdownStr }}）</text>
        </text>
        <view class="invite-actions">
          <button class="grad-btn grad-btn-sm" open-type="share">发送给微信好友</button>
        </view>
      </view>

      <!-- ③ 未加入未生成: 可点击生成按钮 -->
      <view v-else>
        <button
          class="grad-btn"
          :loading="loading"
          :disabled="loading"
          @tap="onInvite"
        >
          {{ loading ? '生成中...' : '生成邀请码' }}
        </button>
        <text v-if="errorMsg" class="error-text">{{ errorMsg }}</text>
      </view>
```

（`inviteCode && !partner` 的「伴侣加入后点击刷新」提示在模板下方独立存在，保持不动；伴侣加入后该条件自动为 false。）

- [ ] **Step 3: 新增样式**

`<style>` 内 `.invite-actions` 之后加：

```css
/* 伴侣已加入: 禁用按钮 + 提示 */
.grad-btn-disabled { opacity: 0.55; }
.invite-full-hint { color: var(--color-text-2); margin-top: 16rpx; }
```

- [ ] **Step 4: 构建 dev + build 并验证产物**

Run:
```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp
npm run dev:mp-weixin   # watch 模式, 等初始编译完成 (或后台运行)
npm run build:mp-weixin # 一次性构建
```
dev 为 watch 进程：启动后等 `dist/dev/mp-weixin/pages/partner/index.js` 时间戳更新，再终止进程。

验证编译产物（三分支 + 提示文案存在）：

```bash
grep -c "伴侣已加入，无需再生成邀请码" dist/dev/mp-weixin/pages/partner/index.wxml
grep -c "伴侣已加入，无需再生成邀请码" dist/build/mp-weixin/pages/partner/index.wxml
```
Expected: 各输出 `1`（提示文案已进 WXML，joined 分支存在）。再确认 JS 里 `resolveInviteAreaState` 被引用：
```bash
grep -c "resolveInviteAreaState" dist/dev/mp-weixin/pages/partner/index.js
```
Expected: `1`。

- [ ] **Step 5: 全量回归测试**

Run:
```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2
node --test scripts/test-invite.js scripts/test-datetime.js scripts/test-commercialization.js
cd uniapp && node --test ../scripts/test-engine.js ../scripts/test-api.js ../scripts/test-rules.js ../scripts/test-auth.js
cd uniapp && node scripts/test-partner-invite-state.js
```
Expected: 全部 pass，`fail 0`。

- [ ] **Step 6: 提交**

```bash
git add uniapp/src/pages/partner/index.vue
git commit -m "feat(phase-10): disable invite button when partner joined"
```

- [ ] **Step 7: 真机/开发者工具手测（最终验收）**

在微信开发者工具（导入 `dist/dev/mp-weixin`）验证：
1. 家庭无伴侣：进入邀请页 → 显示可点击「生成邀请码」。
2. 生成邀请码 → 伴侣扫码加入 → 回到邀请页点刷新 → 邀请卡收起，显示禁用按钮 +「✓ 伴侣已加入，无需再生成邀请码」。
3. 已加入家庭重新进页面：直接显示禁用按钮 + 提示，无邀请卡。
