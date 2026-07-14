# 家计通 · UniApp Vue3 + Vite CLI 骨架（Phase 0）设计

**文档类型**：技术设计 / 实施规格
**日期**：2026-07-10
**关联文档**：[技术方案 V1.1](../../技术方案-UniApp云开发.md)（§3 工程结构、§8.1 pages.json、附录 B manifest）、[开发计划 Phase 0](../../开发计划.md)
**范围**：仅 Phase 0 CLI 骨架，**不含**业务页面与云函数逻辑

---

## 一、目标

将当前 `uniapp/` 下裸的 **Vue2 HBuilderX 脚手架**（默认 Hello 模板）重建为 **UniApp Vue3 + Pinia + Vite CLI 工程**，使其：

- 可通过 `npm install` 安装依赖；
- 可通过 `npm run dev:mp-weixin` / `npm run build:mp-weixin` 编译出微信小程序产物（`dist/dev|build/mp-weixin`）；
- 用微信开发者工具导入产物后能看到一个占位首页。

**非目标（本阶段明确不做）**：3 Tab + 自定义 tabBar、wizard/report 分包、云函数（`cloudfunctions/`）、`wx.cloud` 接入、Pinia store 业务逻辑、真实 appid/env。这些属于后续阶段。

## 二、重建方式

现有 `uniapp/` 内 Vue2 相关文件（`main.js`、`App.vue`、`pages/index/index.vue`、`manifest.json`、`uni.promisify.adaptor.js`）全部替换为 Vue3 CLI 结构。

采用 `@dcloudio/uni-preset-vue` 的 **vite 分支**结构**手工落地**（不运行交互式 `create-uni-app`，避免网络与交互不确定性）。依赖走 DCloud 正式/alpha 发布通道，Vue3 生态版本相互对齐。

核心依赖：
- `vue@^3`、`@dcloudio/uni-app`、`@dcloudio/uni-mp-weixin`（运行时）
- `@dcloudio/vite-plugin-uni`、`vite`（构建）
- `pinia`（状态管理，选型既定，本阶段仅装好并在 `main.js` 挂载）

## 三、目录结构（对齐技术方案 §3，本阶段只建骨架）

```
uniapp/
├── package.json          # Vue3 依赖 + dev/build:mp-weixin 脚本
├── vite.config.js        # uni() 插件
├── index.html            # H5 入口（CLI 必需，即使 MVP 只编译 mp-weixin）
├── .gitignore            # node_modules/ unpackage/ dist/ .hbuilderx/ .DS_Store
├── jsconfig.json         # 路径别名 @ -> src
├── src/
│   ├── main.js           # createSSRApp + createPinia（Vue3）
│   ├── App.vue           # 平台无关壳；initCloud 留 TODO 注释
│   ├── manifest.json     # mp-weixin appid 占位 + cloudfunctionRoot（附录 B）
│   ├── pages.json        # 本阶段仅 pages/home/index
│   ├── uni.scss          # 设计 token 占位
│   ├── pages/
│   │   └── home/index.vue    # 占位首页
│   ├── static/logo.png       # 沿用现有 logo
│   ├── stores/.gitkeep       # Pinia 就位，暂空
│   ├── services/.gitkeep
│   ├── utils/.gitkeep
│   ├── constants/.gitkeep
│   └── components/.gitkeep
```

> 注：源码放入 `src/`，与技术方案 §3 一致；`cloudfunctions/` 本阶段不创建。

## 四、关键决策

1. **pages.json 先只放一个 `pages/home/index`**，以跑通编译为先。完整 3 Tab + 分包 + custom-tab-bar 属后续阶段。
2. **不接 `wx.cloud`**：`App.vue` 与 `services/` 只留结构与 TODO；`initCloud`、`bootstrapUser` 待有 env 时再实现。
3. **appid 用占位 `wxXXXXXXXX`**（同附录 B），有真实 appid 随时替换；`manifest.json` 写入 `cloudfunctionRoot: "cloudfunctions/"` 以对齐后续。
4. **Pinia 现在装好**并在 `main.js` 挂载，`stores/` 目录先空。

## 五、验收标准

| 项 | 标准 |
|----|------|
| 依赖安装 | `cd uniapp && npm install` 成功 |
| 编译产物 | `npm run build:mp-weixin` 成功产出 `dist/build/mp-weixin` |
| 工程结构 | 目录与本文档 §3 一致 |
| 版本 | `manifest.json` `vueVersion: "3"` |

**环境限制**：本地无微信开发者工具，自动化验证止于「编译通过、产物生成」。真机/开发者工具预览与真实 appid/env 联调由开发者本地完成。

## 六、后续阶段（不在本次范围）

- 范围 2：3 Tab + wizard/report 分包 + custom-tab-bar 占位页
- 范围 3：`cloudfunctions/`（api 网关、common/engine、benchmark-data 空壳）
- 之后：`wx.cloud` 接入、测算引擎、各业务页面
