# jiajitong · 家计通

面向 25–32 岁一线/新一线城市新婚与备育双职工家庭，提供「科学预算测算 → 可执行规划报告 → 轻量执行追踪」的家庭财务教练服务。

> **开发与设计以 PDD 楔子版 + 技术方案 + UI 原型 v2 为准**；PRD 通用版仅作背景参考。

## 产品设计阶段

- [产品需求文档（PRD）](docs/PRD.md) — 通用版需求（**已被 PDD 取代为执行版，仅作背景参考**）
- [产品设计文档（楔子版）](docs/PDD-新婚备育家庭财务规划教练.md) — **路径 B 执行版，开发与设计以本文档为准**
- [UI 原型设计规范（v1 专业温暖版）](docs/UI-原型设计.md) — 设计系统、线框说明（设计参考，开发以 v2 为准）
- [UI 原型设计规范（v2 暖光 Bento 版）](docs/UI-原型设计-v2-暖光版.md) — **开发对齐版本**，年轻用户审美、Bento 布局
- [开发计划](docs/开发计划.md) — MVP 分阶段排期、里程碑与测试验收
- [技术方案（UniApp + 微信云开发）](docs/技术方案-UniApp云开发.md) — 架构、云函数、数据库、各功能实现细节（V1.1 已可直接用于开发）
- [可交互 HTML 原型 v1](prototype/index.html) — 浏览器打开预览（375px 小程序视口，设计参考）
- [可交互 HTML 原型 v2](prototype-v2/index.html) — **开发对齐版本**，暖光渐变 + Bento 年轻向界面

## 工程结构

```
jiajitong/
├── docs/             # 产品/设计/技术文档
├── prototype/        # HTML 原型 v1（设计参考）
├── prototype-v2/     # HTML 原型 v2（开发对齐）
├── scripts/          # 工具脚本（索引校验等）
└── uniapp/           # UniApp + 微信云开发正式工程（Phase 0 脚手架）
    ├── src/          # UniApp 源码（3 Tab + 31 屏占位 + 组件 + services）
    └── cloudfunctions/  # 云函数（api 网关 + common 模块 + payNotify + cronJobs）
```

详见 [UniApp 工程 README](uniapp/README.md)。