# Phase 7 预算追踪闭环(M6)设计文档

**日期**:2026-07-23
**里程碑**:M6 —— 北极星指标「启用预算并追踪」可跑通
**前置**:Phase 6(微信登录 + 报告持久化)已达成,plan 已持久化到 `budget_plans`。

---

## 一、目标与范围

从「已有报告」升级到「启用追踪 → 周度填报 → 看板反映真实进度」的闭环。

**本阶段做**:
- 启用追踪(activate)语义落地
- `weekly_entries` 集合 + 周度填报 upsert
- dashboard 聚合接口 + 看板数据化
- home / report / dashboard / weekly 页面从静态骨架接入真实数据
- setup-reminder 接真实订阅授权引导(仅授权)
- 前端云调用层统一到 `services/`

**本阶段不做(留 P1)**:
- 服务端订阅消息推送
- 行动清单采纳写库(`recommendation_status` 集合)—— 继续 localStorage
- 伴侣关联、复盘增强

---

## 二、数据模型

### 2.1 启用追踪语义:用 `activated_at` 标记(已确认)

Phase 6 保存 plan 时即 `is_active: true`,若让 activate 再设 is_active 会成为空操作。因此:

- `is_active` 语义**不变** = 「当前版本报告」(同家庭旧版自动置 false)。
- **新增语义**:`activated_at != null` = 「已启用预算追踪」。
- 该方案对 Phase 6 的 `plans.save` / `plans.getActive` / 报告恢复逻辑**零改动**,回归风险最小。

### 2.2 新增集合 `weekly_entries`

此前仅存在于设计文档与手工初始化清单,云函数代码、自动建集合脚本、本地 memoryStore 均未落地。

```
{
  _id,
  family_id,
  week_start: "2026-07-20",   // ISO 周一起点
  week_end:   "2026-07-26",
  categories: {                // 固定 7 类
    food, daily, entertainment, medical, clothing, transport, other
  },
  total,                       // 7 类之和
  created_at,
  updated_at
}
```

- **唯一联合索引** `family_id + week_start`:保证同周提交 upsert 覆盖而非重复(测试 T7-2)。
- **周界定**:ISO 周一为起点,自然月聚合(已确认)。`week_start` 落在当月的所有 entry 计入本月看板。

需同步补三处:
1. `scripts/create-collections.js`:把 `weekly_entries` 加入创建列表 + 唯一索引;**修复 `safeCreateIndex` 未把 `opts` 传给 `createIndex` 的 bug**(当前 unique 声明未真正生效)。
2. `cloudfunctions/api/common/db.js`:集合声明注释 + 新增 DB 方法。
3. `cloudfunctions/api/handlers/index.js`:本地单测 memoryStore 增加 `weekly_entries` Map。

### 2.3 看板计算逻辑

```
某类已用 = 本月所有 weekly_entries 该类之和
某类进度 = 已用 / plan.categories[i].suggested
总进度   = Σ已用 / plan.monthly_summary.disposable
配色     = <70% 绿 / 70–90% 黄 / >90% 红
```

- 分类预算来源:`plan.categories[i].suggested`(引擎固定 7 类:food/daily/entertainment/medical/clothing/transport/other)。
- 总预算来源:`plan.monthly_summary.disposable`。
- 备育进度(备育用户):基于 `plan.baby_reserve`。

---

## 三、云函数 API 层

### 3.1 分发机制

沿用现有 `action` 字符串 map 分发(非 REST path router)。客户端 `wx.cloud.callFunction({ name:'api', data:{ action, payload, requestId } })`。新增 handler 必须在 `handlers/index.js` 的 `module.exports` 注册 action key。

### 3.2 新增 action(6 个)

| action | 鉴权 | payload | 返回 |
|--------|------|---------|------|
| `plans.activate` | owner | `{}` | `{ plan }`(含 activated_at) |
| `dashboard.get` | member | `{}` | `{ activated, plan, categories[], totals, baby_reserve }` |
| `weekly.getCurrent` | member | `{}` | `{ entry\|null, weekStart, weekEnd }` |
| `weekly.submit` | member | `{ categories }` | `{ entry }`(upsert) |
| `weekly.copyLastWeek` | member | `{}` | `{ categories }`(上周数值,不落库) |

命名与现有 `plans.*` 复数一致。

- **修改本周** = `weekly.submit` upsert 覆盖(按 `family_id+week_start` 唯一键),不单开 update action → 满足 T7-2。
- **复制上周** = `weekly.copyLastWeek` 只返回上周 7 类数值供前端填表,用户确认后再 submit → 满足 T7-3。

### 3.3 鉴权统一

启用现有但未被使用的 `common/auth.js`(`requireUser` / `requireOwner` / `requireFamilyMember`):

- `plans.activate`:owner
- `dashboard.get` / `weekly.*`:member
- `family_id` **一律从当前 user 推导,不信任前端传入**。
- 顺带把 Phase 6 手写 openid 检查收敛到该鉴权层。

### 3.4 dashboard.get 聚合(单次调用返回看板全部数据)

1. 取当前 active plan;若 `activated_at == null` → 返回 `{ activated: false }`(前端走空态)。
2. 查本月 `weekly_entries`(`week_start` 落当月)按类求和。
3. 计算每类 used/suggested/pct/color + 总进度 + 备育进度。

### 3.5 运行时验证点(高优先级)

入口当前用 `context.wxContext` 取 openid,而技术方案标准为 `cloud.getWXContext()`。若真机 `context.wxContext` 为空,所有登录 action 会拿到 `openid=null`(本地 mock ctx 不暴露此问题)。**实现首步**:在开发者工具/真机确认 openid 来源,必要时改用 `cloud.getWXContext()`。

---

## 四、前端

### 4.1 调用层统一(已确认)

- 把 `utils/engineClient.js` 的 wrapper 迁入 `services/`(如 `services/api.js`),统一 requestId、错误拆包、cloud 初始化。
- `engineClient.js` 保留薄转发或标记 deprecated,避免破坏现有 import。
- 新增方法:`activatePlan()`、`getDashboard()`、`getCurrentWeekly()`、`submitWeekly(categories)`、`copyLastWeek()`。

### 4.2 新增 Pinia store `stores/plan.js`

当前仅有 wizard store,plan 靠 globalData + localStorage 三条通道易失联。

- 持有:`activePlan`、`activated`、`dashboard` 快照。
- 修 Phase 6 遗留:preview 拉到的 plan 回写统一状态,解决冷启动后进 full 页「未找到规划数据」。
- home / dashboard 从 store 读。

### 4.3 页面数据化

去掉全部写死数据(晓雯家庭 / 82分 / 6月 / ¥11,300 等)。

| 页面 | 改造 |
|------|------|
| **home** (P-home) | onShow 加载 active plan;有 plan 填真实健康分/储蓄/备育;无 plan → 跳 `home/empty`(修登录默认跳静态 home 的 bug) |
| **report/preview + full** | 「启用追踪」按钮接 `activatePlan()`,成功后进 dashboard(**两个入口都接**) |
| **dashboard** | onShow 调 `dashboard.get`;`activated:false` → 空态 + CTA(T7-4);否则渲染总进度条 + 7 类 + 备育条,按 pct 配色;补 loading/error 分支 |
| **weekly** | onLoad 调 `getCurrent` 预填;7 类输入补稳定 id(food/daily/…)映射;「复制上周」调 `copyLastWeek`;「提交」调 `submitWeekly`,成功后回 dashboard |
| **setup-reminder** | 「订阅」接真实 `uni.requestSubscribeMessage` 授权引导(仅授权,不做服务端推送) |

**FloatNav** 逻辑保持,dashboard 页内部按 activation 自动切空态/实态。

---

## 五、验收标准(对齐开发计划 Phase 7)

- [ ] 点击「启用预算追踪」后看板从 0% 开始
- [ ] 填报 ¥500 餐饮后,餐饮进度立即更新
- [ ] 「复制上周」复制 7 类数值
- [ ] 某类 ≥80% 时看板显示警告态
- [ ] 备育用户首页可见储备进度条

### 测试清单

| # | 场景 | 期望 |
|---|------|------|
| T7-1 | 启用 → 填一周 → 看板 | 百分比正确 |
| T7-2 | 同周重复提交 | 覆盖而非 duplicate(唯一索引) |
| T7-3 | 跨月 | 月初进度重置(自然月聚合) |
| T7-4 | 未启用进看板 | 空态 + CTA |

新增引擎/规则外的测试脚本(参照 `scripts/test-*.js` 模式):`scripts/test-tracking.js` 覆盖 activate / weekly upsert / dashboard 聚合。

---

## 六、关键风险与衔接点

1. **DB provisioning**:`weekly_entries` 集合与唯一索引需真实创建,`safeCreateIndex` 的 opts bug 需修。
2. **activated_at 语义**:确保 activate 幂等,不破坏 Phase 6 save/getActive。
3. **openid 来源**:真机验证 `context.wxContext` vs `cloud.getWXContext()`。
4. **调用层统一**:避免两套封装继续分叉。
5. **页面整体数据化**:loading/error/empty 三态齐全,清除所有硬编码。
