# 家计通 Phase 1-3 总结

**截止日期**：2026-07-16
**状态**：M2 里程碑达成，可演示
**下一里程碑**：M3（Phase 4 — 完整 5 步向导）

---

## 一、已完成里程碑

### M0 工程就绪（W0 末）
- ✅ Vue3 + Vite + Pinia 脚手架
- ✅ 微信云开发初始化（appid + envId）
- ✅ UniApp 编译 mp-weixin 通过

### M1 引擎可用（W1 末）
- ✅ `common/benchmark-data/` — 10 城 × 7 类人均月消费 + 备育首年增量
- ✅ `common/engine/` — calcQuick / calcFull / calcHealthScore / calcBabyReserve 纯函数
- ✅ 异常检测：IMBALANCE 抛错 / CITY_NOT_COVERED fallback / BABY_TOO_SOON warning
- ✅ 29 单测覆盖基准/阶段/健康分/边界/城市/备育
- ✅ 性能：10 城 × 100 次 < 1ms（门禁 50ms）

### M2 快测闭环（W2 末）
- ✅ `cloudfunctions/api/` 网关 — cities.list / calc.quick / calc.full 三个 action
- ✅ 统一响应格式 `{code, message, userHint, details}`
- ✅ 错误码规范（IMBALANCE/VALIDATION/UNKNOWN_ACTION/CITY_NOT_COVERED 等）
- ✅ 网关层 15 单测
- ✅ 前端 engineClient — 永远走 wx.cloud.callFunction
- ✅ vite alias `@` → `src/`
- ✅ step1 真实城市列表（10 城 + tier + "更多城市即将开放"）
- ✅ step2/3 真实数据流转（URL query）
- ✅ result 接 callCalcQuick，状态 pill 三态 + IMBALANCE 跳错误页

### 总单测：**44/44 pass**（29 引擎 + 15 网关）
### 总耗时：**约 3 个工作日**（含部署修复、编译修复）

---

## 二、架构图

```
┌──────────────────────────────────────────────────────────────┐
│                      微信小程序前端                            │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │ pages/quick/    │    │ engineClient    │                  │
│  │ step1/2/3/result│───→│ .callCalcQuick() │                  │
│  │ (URL query 传值)│    │ .callCitiesList()│                  │
│  └─────────────────┘    └────────┬────────┘                  │
│                                  │ wx.cloud.callFunction      │
└──────────────────────────────────┼───────────────────────────┘
                                   │
                  ┌────────────────▼─────────────────┐
                  │     云函数 api 网关              │
                  │  cloudfunctions/api/index.js     │
                  │  ┌──────────────────────────┐   │
                  │  │ dispatch(event, ctx)     │   │
                  │  │ → handlers[action]       │   │
                  │  └────────┬─────────────────┘   │
                  │           │ require              │
                  │  ┌────────▼─────────────────┐   │
                  │  │ common/engine/*          │   │
                  │  │ common/benchmark-data/*  │   │
                  │  │ common/response.js       │   │
                  │  └──────────────────────────┘   │
                  └──────────────────────────────────┘
```

### 关键设计决策

1. **引擎单一来源**：`uniapp/cloudfunctions/api/common/engine/index.js` 是唯一入口，云函数 `api/` 和 Node 单测都从这里 require
2. **common 内嵌于 api/**：微信云函数上传是单目录制，common/ 必须在 api/ 内部（技术方案 §3 写的兄弟目录不适用实际部署）
3. **前端不直接 import 引擎**：UniApp rollup 对 CJS 具名导入不友好，会产生 `void 0` 死代码；前端永远走 wx.cloud.callFunction
4. **统一错误格式**：`engine/errors.js` 抛 BizError，网关 catch 转 fail，前端 throw CloudError
5. **环境 ID 三套统一**：dev/staging/prod 都用 `cloud1-0g12dcf7941e979c`（仅 1 个云环境）

---

## 三、文件树（新增）

```
jiajitong_v2/
├── uniapp/
│   ├── src/
│   │   ├── App.vue              ← onLaunch 调 initCloud(envId)
│   │   ├── config/cloud.js      ← BUILD_ENV + CLOUD_ENV_IDS
│   │   ├── manifest.json        ← appid + envId 三环境
│   │   ├── pages/quick/         ← step1/2/3/result.vue (Phase 3)
│   │   ├── services/cloud.js    ← initCloud + callFunction
│   │   └── utils/engineClient.js← 前端云函数调用桥
│   ├── cloudfunctions/api/      ← 单云函数自包含
│   │   ├── index.js             ← 网关主入口 (wx-server-sdk)
│   │   ├── handlers/index.js    ← 3 个 action
│   │   ├── common/
│   │   │   ├── engine/          ← 测算引擎 (calcQuick/calcFull/...)
│   │   │   ├── benchmark-data/  ← 10 城 + 7 类 + 备育基准
│   │   │   └── response.js      ← 统一响应 + 错误码表
│   │   └── package.json         ← wx-server-sdk ~2.6.3
│   ├── project.config.json      ← miniprogramRoot + cloudfunctionRoot
│   ├── vite.config.js           ← resolve.alias '@' → src/
│   └── package.json             ← test 脚本
└── scripts/
    ├── test-engine.js           ← 29 单测
    ├── test-api.js              ← 15 单测
    └── demo-quick.js            ← 探针 (直接 require 引擎验证算法)
```

---

## 四、部署清单

### 首次部署（已完成）
```
1. 微信开发者工具导入 /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/
2. 开通云开发 (免费配额)，envId = cloud1-0g12dcf7941e979c
3. 右键 cloudfunctions/api/ → 上传并部署 (云端安装依赖)
4. 等待 30 秒
5. 真机扫码预览
```

### 每次更新
```
1. 修改代码
2. git commit + push (触发 CI 如有)
3. 微信开发者工具自动编译 (dev:mp-weixin)
4. 真机扫码即可看到新版本 (云函数代码变更才需要重新上传)
```

### 切换环境
```js
// uniapp/src/config/cloud.js
export const BUILD_ENV = 'staging'  // 或 'prod'
```
重新 `npm run build:mp-weixin`。

---

## 五、API 契约

### cities.list
```js
// request
{ action: 'cities.list', payload: {} }

// response
{ code: 0, data: { cities: [{ name, tier, medianIncome }] } }
```

### calc.quick
```js
// request
{ action: 'calc.quick', payload: { city, income, housing } }

// response (success)
{ code: 0, data: { health_score, risk_level, monthly_summary, disposable_range,
                   top_recommendation, city_estimated, warnings } }

// response (IMBALANCE)
{ code: 40001, message: 'IMBALANCE', userHint: '固定支出占比过高，建议先梳理必选项',
  details: { fixedExpense, income, ratio } }
```

### calc.full
```js
// request
{ action: 'calc.full', payload: {
    stage, city, monthlyIncome, incomeStability,
    fixedExpenses: { housing, loan, insurance, ... },
    savingsTarget, emergencyFundMonths,
    monthsToBaby?, currentBabyReserve?
}}

// response (success) — PDD §6.1 schema
{ code: 0, data: { plan_id, health_score, risk_level, monthly_summary,
                   categories: [7项], baby_reserve, recommendations: [],
                   risk_report: { city_estimated, imbalance, baby_too_soon } } }
```

---

## 六、已知问题 & 待办

### 待办
- [ ] Phase 4 — 5 步向导 subpackages/wizard/step1-5 + report/preview
- [ ] Phase 5 — R01–R07 / R-N01–N07 规则引擎
- [ ] Phase 6 — 微信登录 + openid 缓存 + 报告持久化（需要 DB）
- [ ] 基准数据校准（PDD §附录 B 缺真实数据，目前是占位估算）
- [ ] Calc.preview session 缓存（calc.full 结果临时存）
- [ ] 限流（rateLimit.js）

### 已知小问题
- calcQuick 固定 89% 时 score=58 risk=red（不抛错但预警），符合 PDD §6.3
- `recommendations: []` 是空数组，Phase 5 接入规则引擎
- uni.scss 中部分 SCSS 变量未用满（v2 暖光版样式未完全对接）

### 技术债
- 前端 API 错误捕获用 vConsole 看，无统一 toast 提示（Phase 7 再加）
- `cloudfunctions/api/cloud.js` 是死代码（index.js 内部已 inline wx-server-sdk）— 清理
- `scripts/seed-benchmarks.js` 没接 DB，单纯打印 — Phase 9 运营接入

---

## 七、性能指标

| 指标 | 计划 | 实际 |
|------|------|------|
| 单测数 | ≥ 20 (Phase 1) | 29 |
| 网关单测 | ≥ 8 (Phase 2) | 15 |
| 总单测 | — | 44 |
| 单测耗时 | < 5s | 40ms |
| 10 城 calcQuick 平均 | < 50ms | < 1ms |
| 网关 P95 响应 | ≤ 500ms | < 1ms |
| mp-weixin 编译 | < 5s | 2s |
| 前端 bundle | < 1.5 MB (主包) | 待 build:mp-weixin 验证 |

---

## 八、相关文档

- [PDD 楔子版](PDD-新婚备育家庭财务规划教练.md) — 引擎算法依据
- [UI 原型 v2 暖光 Bento](UI-原型设计-v2-暖光版.md) — 前端设计依据
- [开发计划](开发计划.md) — Phase 划分与里程碑
- [技术方案 UniApp 云开发](技术方案-UniApp云开发.md) — 架构原始文档
- [云数据库初始化指南](云数据库初始化指南.md) — Phase 6 准备
- [Phase 1 实现计划](superpowers/plans/2026-07-14-phase-1-engine.md) — Phase 1 任务清单

---

## 九、下一步（Phase 4 — M3）

按开发计划 §三 Phase 4：

| 任务 | 说明 |
|------|------|
| subpackages/wizard/step1 | 家庭阶段 pick-card；选备育解锁 Step 4 分支 |
| subpackages/wizard/step2 | 城市 + 收入 + 稳定性（city/income 从 step1/2 quick 带入）|
| subpackages/wizard/step3 | 固定开销列表；实时固定占比进度 |
| subpackages/wizard/step4 | 储蓄 + 备育储备 + 计划生育日期 |
| subpackages/wizard/step5 | 汇总卡片 + 生成按钮 + loading 三步骤文案 |
| subpackages/report/preview | 免费：健康分 + 总预算 + 1 条建议 + 2 类预算；其余 blur |

### M3 验收
- [ ] 5 步均可前进/后退，数据不丢
- [ ] 备育用户 Step 4 出现储备模块
- [ ] 生成动画 ≤2s 后进入报告预览
- [ ] 从快测结果页进入向导时预填 city/income/housing

### 工作量预估：半天

---

**文档结束**