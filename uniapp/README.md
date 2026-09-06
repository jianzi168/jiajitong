# 家计通 UniApp 工程

微信小程序（UniApp Vue 3 + Pinia）+ 微信云开发（单云函数 `api` + 云数据库）。

## 常用命令

```bash
cd uniapp

npm test                  # 全量测试：scripts/test-*.js（云端逻辑）+ 本地 3 个 ESM 脚本
npm run test:cloud        # 仅云端逻辑测试（node --test，glob 匹配）
npm run test:client       # 仅 3 个前端纯函数脚本
npm run build:mp-weixin   # 构建到 dist/build/mp-weixin（含 cloudfunctions 拷贝）
npm run dev:mp-weixin     # 开发模式
npm run sync:cf           # 只同步 cloudfunctions 到 dist/dev
```

`npm test` 用 glob 匹配 `../scripts/test-*.js`，**新增测试文件会自动纳入**，无需改 package.json。
退出码非 0 即代表有失败，可直接用于 CI。

## 目录结构

```
src/
├── pages/            # 主包页面（pages.json 注册）
├── subpackages/      # 分包：wizard（向导 5 步 + loading）、report（规划书/分享）
├── components/       # ScreenBody / NavBar / ProgressBar / ScoreRing / FloatNav
├── stores/           # Pinia：plan（当前方案与看板）、wizard
├── services/         # api.js（云函数统一入口）、cloud.js、session.js
├── utils/            # datetime / analytics / poster / pdf / capsule ...
└── config/           # cloud.js（环境 envId）

cloudfunctions/api/
├── index.js          # 云函数入口：main() 解析 openid → dispatch()
├── handlers/index.js # 全部 action 实现（云端 db 与内存 memoryStore 双路径）
└── common/
    ├── date.js       # 业务时区日期工具（见下方"日期约定"）
    ├── db.js         # 云数据库封装
    ├── engine/       # 测算引擎（纯函数，零读库）
    │   └── rules/    # R01–R07 + R-N01–N07
    └── benchmark-data/  # 30 城 / 7 大类基准 / 备育基准
```

## 两个重要约定

### 1. 日期一律走 `cloudfunctions/api/common/date.js`

**不要用 `toISOString().slice(0, 10)` 取日期串。** 它输出 UTC，而业务时区是 UTC+8，
本地零点等于前一日 16:00Z，日期会整体退一天——曾导致周起点算成周日、
月份聚合边界错位（当月最后一天的记录漏统计）。

`common/date.js` 固定按 UTC+8 显式换算，**不依赖运行环境 TZ**，
本地测试与云端行为完全一致。需要日期串时用：

```js
const dateUtil = require('../common/date')
dateUtil.toDateString()          // 'YYYY-MM-DD'（业务时区）
dateUtil.weekRange()             // { weekStart, weekEnd } ISO 周一起点
dateUtil.monthRange()            // { start, end, year, month }
dateUtil.monthFilter(y, m)       // { start, nextStart } 用于字符串比较过滤
dateUtil.daysOfWeekInMonth(...)  // 跨月周按天分摊
```

前端侧对应工具在 `src/utils/datetime.js`（倒计时/时间差）。

### 2. 引擎调节系数必须「按类目取不同值」

`engine/normalize.js` 会做归一化：`ratio = base / Σbase`。
**任何对 7 个类目取同一值的因子都会在这里被完全约掉。**

历史上 `tier` / `stage` / `income` 三个系数都是统一标量，导致上海、成都、兰州
算出完全相同的预算——"按城市测算"形同虚设。现在它们都改为按类目差异化
（见 `benchmark-data/category-benchmarks.js` 的 `tierNShare` / `incomeElasticity`
与 `engine/constants.js` 的 `STAGE_SHARE_MODIFIERS`）。

**改这块时务必保证系数是分类目的**，否则问题会静默复现——测试不报错，
只是城市差异悄悄消失。`scripts/test-engine.js` 有对应用例锁死这一不变量。

## 跨月周的统计口径

周记账以「周」为单位存储，跨月的周（如 8/31–9/6）**按天比例分摊到各月**，
而非整周归属单一月份。否则每月 1–6 日填报的支出会在当月看板中完全消失。

实现见 `common/date.js` 的 `daysOfWeekInMonth()` 与 handlers 的
`accumulateEntriesByDayShare()`。云端查询用 `db.getMonthOverlappingEntries()`
（向左放宽 7 天），内存路径用 `findMonthlyEntriesLocal()`，两者行为需保持一致。

## 测试说明

- `scripts/` 下的测试走 `memoryStore`，**不需要真实云环境**。
- handlers 导出了 `_resetMemory` / `_seedWeeklyEntry` / `_seedAppConfig` 等测试钩子。
- 新增 action 时，云端（`db.*`）与内存（memoryStore）两条路径都要实现，否则本地测试覆盖不到。
