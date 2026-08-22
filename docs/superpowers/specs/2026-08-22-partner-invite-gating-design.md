# 伴侣已加入时禁用「生成邀请码」— 设计

**日期**：2026-08-22
**分支**：`feature/phase-8-commercialization`
**状态**：已获批准

## 背景

邀请伴侣页（`uniapp/src/pages/partner/index.vue`）在伴侣已加入后仍显示可点击的「生成邀请码」按钮。产品上家庭满员（owner + 1 伴侣）后无需再生成邀请码，且后端 `families.inviteCreate` 没有成员上限检查，可直调 API 绕过 UI。

## 决策（已确认）

1. 伴侣已加入且未生成邀请码 → **禁用按钮 + 提示文字**。
2. 已生成邀请码后伴侣才加入 → **自动收起邀请卡**。
3. 后端 `families.inviteCreate` 在家庭已有成员时**拒绝**（防绕过）。

## 方案（已选：前端三分支模板 + 后端拦截）

### 前端 `uniapp/src/pages/partner/index.vue`

新增 `hasPartner` computed：

```js
const hasPartner = computed(() => !!partner.value)
```

模板邀请区重构为三分支：

| 状态 | 呈现 |
|---|---|
| `hasPartner`（伴侣已加入） | 禁用「生成邀请码」按钮 + 提示「✓ 伴侣已加入，无需再生成邀请码」；邀请卡自动收起 |
| `!hasPartner && inviteCode` | 邀请卡（现状：码 + 复制 + 分享 + 刷新提示） |
| `!hasPartner && !inviteCode` | 可点击「生成邀请码」按钮（现状） |

新增样式：`.grad-btn[disabled]`（置灰）、`.invite-full-hint`（提示文案）。

`onInvite` 竞态处理：捕获后端新错误码 `41008` → `await loadMembers()` 刷新成员 → 自动切到已加入态。

### 后端

**`common/response.js`**：Phase 10 错误块新增 `FAMILY_ALREADY_PAIRED: 41008`。

**`handlers/index.js`**：
- 抽取公共函数 `listFamilyMembers(familyId)`（cloud + memory 两种模式），供 `familiesGetMembers` 与 `familiesInviteCreate` 复用。
- `familiesInviteCreate` 在 `requireOwner` 之后、创建邀请之前：

```js
const members = await listFamilyMembers(user.family_id)
if (members.length > 0) {
  return fail(ERROR_CODE.FAMILY_ALREADY_PAIRED, 'FAMILY_ALREADY_PAIRED', '伴侣已加入，无需再生成邀请码')
}
```

### 测试 `scripts/test-invite.js`

- **I-11**：owner 创建邀请 → 伴侣加入 → owner 再次 `inviteCreate` → `41008`。
- **I-12**：成员为空时可正常创建（回归）。
- 现有 I-1~I-10 保持绿。

## 边界

- 竞态：成员在页面加载后加入 → 前端捕获 41008 → 刷新成员列表进入已加入态。
- 非 owner 调 `inviteCreate` → `requireOwner` 先行，行为不变。
- cloud 路径复用 `db.getFamilyMembers`，无新增 DB 依赖。
