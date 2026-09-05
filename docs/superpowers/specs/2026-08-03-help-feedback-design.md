# 帮助与反馈 · 设计规格

> 日期：2026-08-03  
> 状态：已实现  
> 入口：我的 → 帮助与反馈

## 1. 目标

为用户提供：
1. **常见问题（FAQ）**：解答测算、订阅、伴侣、数据隐私等高频疑问  
2. **意见反馈**：收集功能建议与问题描述，写入云数据库供内测跟进  

成功标准：用户可从「我的」进入页面、阅读 FAQ、匿名或登录态提交反馈并收到真实成功/失败提示（不假装成功）。

## 2. 范围

### 本期做（In）

- 单页：`pages/help/index`（自定义 NavBar）
- FAQ 手风琴：前端常量 5～8 条，默认展开第一条
- 反馈表单：类型 pill + 正文 + 选填联系方式
- 云函数 `feedback.submit` + 集合 `feedbacks`
- 未登录可提交；已登录写入 `openid`
- 简单限流；前端校验与禁用重复提交
- 预留远程 FAQ 接口说明（本期不调用）

### 本期不做（Out）

- 截图 / 图片上传
- 管理后台、运营回复、订阅消息回访
- 强制登录或强制填写联系方式
- FAQ 远程拉取（仅预留）
- 微信客服会话组件

## 3. 用户体验

### 信息架构

单页自上而下：

1. NavBar：标题「帮助与反馈」，返回上一页  
2. 区块「常见问题」：手风琴列表  
3. 区块「意见反馈」：类型 → 内容 → 联系方式 → 提交  

风格对齐暖光设计系统：`glass-card`、pill、`.grad-btn`、固定顶栏与胶囊避让（复用现有 `NavBar`）。

### 反馈类型

| UI 文案 | 存储值 |
|---------|--------|
| 功能建议 | `suggestion` |
| 遇到问题 | `bug` |
| 其他 | `other` |

默认选中「功能建议」。

### 校验与反馈

| 条件 | 行为 |
|------|------|
| content trim 后 &lt; 10 字 | toast「再多写一点」，不请求 |
| content &gt; 500 字 | toast「内容太长」，禁止提交 |
| contact &gt; 50 字 | toast「联系方式太长」，禁止提交 |
| 提交中 | 按钮 disabled，防连点 |
| 成功 | toast「感谢反馈」，清空 content / contact，保留 type |
| 业务失败 | 展示 `userHint`，不改本地已填内容 |
| 限流 | toast「提交太频繁，稍后再试」 |

## 4. FAQ 内容（初稿，可微调文案）

存放于 `uniapp/src/constants/faq.js`，结构：`{ id, question, answer }[]`。

1. **预算数字怎么算出来的？** — 基于城市消费水平与填写的收入、阶段，由规则引擎给出建议区间；不是理财产品推荐。  
2. **免费版和 Pro 有什么区别？** — 免费可测算与部分看板；完整规划书、PDF 导出、全部建议等需 Pro / 对应权益（与现有 paywall 文案一致）。  
3. **如何邀请伴侣一起看？** — 我的 → 伴侣管理，或完整版规划书「邀请伴侣共读」，生成邀请码分享。  
4. **周度填报有什么用？** — 用于对照本月预算进度，形成轻量追踪习惯。  
5. **数据安全吗？会卖掉吗？** — 数据加密存储，不算理财、不卖贷款；详见隐私页。  
6. **如何导出或注销数据？** — 我的 → 数据导出与隐私。  

预留：`faq.list` 云函数可在后续直接替换常量来源；本期前端不调用。

## 5. 数据模型

### 集合 `feedbacks`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 云库自动 |
| `openid` | string \| null | 有登录态则写入，否则 `null` |
| `type` | string | `suggestion` \| `bug` \| `other` |
| `content` | string | 必填，10～500 字 |
| `contact` | string | 选填，≤50 字，缺省 `''` |
| `client_meta` | object | 可选：`{ sdkVersion?, platform?, appVersion? }` |
| `created_at` | number | `Date.now()` |
| `status` | string | 固定 `'new'` |

### 索引

- `created_at` 降序（`check-indexes` / `create-collections` 登记）

### 安全

- 客户端禁止直写集合；仅经云函数 `feedback.submit` 写入  
- 不返回他人反馈列表；submit 仅回 `{ id }`

## 6. API

### `feedback.submit`

**鉴权：** 不调用 `requireAuth`，不要求 `user.bootstrap`。  
小程序端调用云函数时，微信上下文通常仍带 `OPENID`：有则写入 `openid`，测试/异常无 openid 时写 `null`。  
「未登录可提交」= 未走登录引导也可提交，不是指没有微信 openid。

**Payload：**

```json
{
  "type": "suggestion",
  "content": "希望增加…",
  "contact": "微信号或手机（可选）",
  "client_meta": {}
}
```

**成功：** `{ code: 0, data: { id: "<feedback_id>" } }`

**失败：**

| 场景 | code | userHint |
|------|------|----------|
| type 非法 / content 过短过长 / contact 过长 | `VALIDATION_ERROR` (40010) | 对应中文提示 |
| 限流 | `RATE_LIMITED` (42901) | 提交太频繁，稍后再试 |
| 写库失败 | `INTERNAL_ERROR` (50001) | 提交失败，请稍后重试 |

**限流：** 键 = `openid`（有则用之），否则 `anon`。同一键每分钟最多 3 次。  
实现：handler 进程内 `Map`（与现有 memoryStore 测试模式一致）。不追求多实例精确限流。

## 7. 前端文件

| 文件 | 职责 |
|------|------|
| `uniapp/src/pages/help/index.vue` | 页面 UI + 提交逻辑 |
| `uniapp/src/pages.json` | 注册 `pages/help/index`，`navigationStyle: custom` |
| `uniapp/src/pages/profile/index.vue` | 菜单 url → `/pages/help/index` |
| `uniapp/src/constants/faq.js` | FAQ 常量 |
| `uniapp/src/services/api.js` | `submitFeedback = wrap('feedback.submit')` |
| `uniapp/cloudfunctions/api/handlers/index.js` | `feedbackSubmit` |
| `uniapp/cloudfunctions/api/common/db.js` | `createFeedback` |
| `scripts/create-collections.js` / `check-indexes.js` | 集合与索引 |
| `scripts/test-feedback.js` | 校验、限流、openid 可选 |

## 8. 测试计划

1. 未登录 submit → 成功且 `openid` 为 null（内存或 DB 断言）  
2. 登录 submit → 成功且带 openid  
3. content 过短 / type 非法 → VALIDATION_ERROR  
4. 连续超限 → RATE_LIMITED  
5. 手动：我的 → 帮助与反馈 → 展开 FAQ → 提交 → toast 成功  

## 9. 实现备注

- 遵循现有 `ok` / `fail` / `wrap(action)` 模式  
- 帮助页使用共享 `NavBar`（已含固定顶栏与胶囊避让）  
- YAGNI：不做后台列表 UI；运营可在云开发控制台查 `feedbacks`  
