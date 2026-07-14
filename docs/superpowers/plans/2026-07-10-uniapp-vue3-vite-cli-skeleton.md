# UniApp Vue3 + Vite CLI 骨架（Phase 0）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `uniapp/` 从 Vue2 HBuilderX 脚手架重建为可 `npm run build:mp-weixin` 编译的 UniApp Vue3 + Pinia + Vite CLI 工程。

**Architecture:** 手工落地 `@dcloudio/uni-preset-vue` vite 分支结构；源码集中在 `src/`，微信小程序为唯一编译目标；Pinia 装好并挂载但暂无 store 逻辑；不接 `wx.cloud`。

**Tech Stack:** Vue 3、@dcloudio/uni-app、@dcloudio/uni-mp-weixin、@dcloudio/vite-plugin-uni、Vite、Pinia。

## Global Constraints

- `manifest.json` 必须 `vueVersion: "3"`。
- 唯一编译目标：微信小程序（mp-weixin）。
- `manifest.json.mp-weixin` 必须含 `cloudfunctionRoot: "cloudfunctions/"`（对齐技术方案附录 B），appid 用占位 `wxXXXXXXXX`。
- 本阶段 pages.json 只含 `pages/home/index`，不建 Tab/分包/custom-tab-bar。
- 不接 `wx.cloud`，`App.vue`/`services/` 只留结构与 TODO。
- 源码根为 `src/`。
- `.gitignore` 忽略 `node_modules/ unpackage/ dist/ .hbuilderx/ .DS_Store`。
- 参考文档：技术方案 §3（结构）、§8.1（pages.json）、附录 B（manifest）。

---

### Task 1: 清理旧 Vue2 文件并重建工程配置

**Files:**
- Delete: `uniapp/main.js`、`uniapp/App.vue`、`uniapp/pages/index/index.vue`、`uniapp/manifest.json`、`uniapp/pages.json`、`uniapp/index.html`、`uniapp/uni.promisify.adaptor.js`、`uniapp/uni.scss`
- Move: `uniapp/static/logo.png` → `uniapp/src/static/logo.png`
- Create: `uniapp/package.json`、`uniapp/vite.config.js`、`uniapp/index.html`、`uniapp/jsconfig.json`
- Modify: `uniapp/.gitignore`

**Interfaces:**
- Produces: npm 脚本 `dev:mp-weixin` / `build:mp-weixin`；vite `uni()` 插件配置；`@` → `src` 别名。

- [ ] **Step 1: 删除旧 Vue2 文件、移动 logo**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp
git rm main.js App.vue pages/index/index.vue manifest.json pages.json index.html uni.promisify.adaptor.js uni.scss
mkdir -p src/static
git mv static/logo.png src/static/logo.png
rmdir static pages/index pages 2>/dev/null || true
```

- [ ] **Step 2: 写 `uniapp/package.json`**

```json
{
  "name": "jiajitong",
  "version": "1.0.0",
  "description": "家计通 UniApp（微信小程序）",
  "scripts": {
    "dev:mp-weixin": "uni -p mp-weixin",
    "build:mp-weixin": "uni build -p mp-weixin"
  },
  "dependencies": {
    "@dcloudio/uni-app": "3.0.0-4060620250520001",
    "@dcloudio/uni-components": "3.0.0-4060620250520001",
    "@dcloudio/uni-mp-weixin": "3.0.0-4060620250520001",
    "pinia": "^2.0.36",
    "vue": "^3.4.21"
  },
  "devDependencies": {
    "@dcloudio/types": "^3.4.8",
    "@dcloudio/uni-automator": "3.0.0-4060620250520001",
    "@dcloudio/uni-cli-shared": "3.0.0-4060620250520001",
    "@dcloudio/vite-plugin-uni": "3.0.0-4060620250520001",
    "vite": "5.2.8"
  }
}
```

> 注：若安装时报某个 `3.0.0-4060620250520001` 版本不存在（alpha 通道会滚动），执行 `npm view @dcloudio/vite-plugin-uni dist-tags` 取最新 alpha tag，将所有 `@dcloudio/*` 三方版本统一替换为该版本号后重装。

- [ ] **Step 3: 写 `uniapp/vite.config.js`**

```javascript
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()]
})
```

- [ ] **Step 4: 写 `uniapp/index.html`（CLI 必需的 H5 入口）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>家计通</title>
    <script>
      var coverSupport = 'CSS' in window && typeof CSS.supports === 'function' && (CSS.supports('top: constant(a)') || CSS.supports('top: env(a)'))
      document.write('<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no' + (coverSupport ? ',viewport-fit=cover' : '') + '" />')
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: 写 `uniapp/jsconfig.json`（@ 别名 + uni 类型）**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 6: 覆盖写 `uniapp/.gitignore`**

```
node_modules/
unpackage/
dist/
.hbuilderx/
.DS_Store
```

- [ ] **Step 7: 提交**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2
git add uniapp
git commit -m "chore(uniapp): 移除 Vue2 脚手架, 落地 Vue3+Vite CLI 工程配置"
```

---

### Task 2: 落地 src 源码骨架（main.js / App.vue / pages / manifest / pages.json）

**Files:**
- Create: `uniapp/src/main.js`、`uniapp/src/App.vue`、`uniapp/src/manifest.json`、`uniapp/src/pages.json`、`uniapp/src/uni.scss`、`uniapp/src/pages/home/index.vue`
- Create（占位空目录）: `uniapp/src/stores/.gitkeep`、`uniapp/src/services/.gitkeep`、`uniapp/src/utils/.gitkeep`、`uniapp/src/constants/.gitkeep`、`uniapp/src/components/.gitkeep`

**Interfaces:**
- Consumes: Task 1 的 vite/uni 配置与依赖。
- Produces: 可被 uni 识别的 Vue3 应用入口与单个首页路由 `pages/home/index`。

- [ ] **Step 1: 写 `uniapp/src/main.js`（Vue3 + Pinia）**

```javascript
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
```

- [ ] **Step 2: 写 `uniapp/src/App.vue`（平台无关壳）**

```vue
<script setup>
import { onLaunch, onShow } from '@dcloudio/uni-app'

onLaunch(() => {
  // #ifdef MP-WEIXIN
  // TODO(Phase 1): initCloud() — wx.cloud.init({ env, traceUser: true })
  // TODO(Phase 1): userStore().bootstrap()
  // #endif
  // #ifndef MP-WEIXIN
  console.warn('家计通 MVP 仅支持微信小程序，当前平台不可用')
  // #endif
})

onShow(() => {})
</script>

<template>
  <!-- App.vue 无模板内容，仅承载全局逻辑与样式 -->
</template>

<style>
/* 全局公共样式 */
</style>
```

- [ ] **Step 3: 写 `uniapp/src/pages/home/index.vue`（占位首页）**

```vue
<script setup>
const title = '家计通'
</script>

<template>
  <view class="home">
    <image class="logo" src="/static/logo.png" mode="widthFix" />
    <text class="title">{{ title }}</text>
    <text class="subtitle">Phase 0 · 工程骨架就绪</text>
  </view>
</template>

<style>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}
.logo {
  width: 200rpx;
  margin-bottom: 40rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 600;
  color: #1f2328;
}
.subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #8f8f94;
}
</style>
```

- [ ] **Step 4: 写 `uniapp/src/pages.json`（仅首页）**

```json
{
  "pages": [
    {
      "path": "pages/home/index",
      "style": {
        "navigationBarTitleText": "家计通"
      }
    }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "家计通",
    "navigationBarBackgroundColor": "#FFFFFF",
    "backgroundColor": "#F7F7F9"
  }
}
```

- [ ] **Step 5: 写 `uniapp/src/manifest.json`（Vue3 + mp-weixin + cloudfunctionRoot）**

```json
{
  "name": "家计通",
  "appid": "",
  "description": "新婚备育家庭财务规划教练",
  "versionName": "1.0.0",
  "versionCode": "100",
  "transformPx": false,
  "vueVersion": "3",
  "mp-weixin": {
    "appid": "wxXXXXXXXX",
    "cloudfunctionRoot": "cloudfunctions/",
    "setting": {
      "urlCheck": true,
      "es6": true,
      "minified": true
    },
    "usingComponents": true,
    "permission": {
      "scope.writePhotosAlbum": {
        "desc": "用于保存分享长图到相册"
      }
    }
  }
}
```

- [ ] **Step 6: 写 `uniapp/src/uni.scss`（设计 token 占位）**

```scss
/* 设计 token 占位，后续对齐 prototype-v2 暖光 Bento 版 */
$uni-color-primary: #ff8a3d;
$uni-text-color: #1f2328;
$uni-text-color-grey: #8f8f94;
$uni-bg-color: #f7f7f9;
```

- [ ] **Step 7: 建占位空目录**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/src
for d in stores services utils constants components; do mkdir -p "$d" && touch "$d/.gitkeep"; done
```

- [ ] **Step 8: 提交**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2
git add uniapp/src
git commit -m "feat(uniapp): 落地 Vue3 源码骨架与占位首页"
```

---

### Task 3: 安装依赖并验证编译产物

**Files:** 无新增源码（生成 `package-lock.json`、`dist/`）

**Interfaces:**
- Consumes: Task 1、Task 2 全部产物。

- [ ] **Step 1: 安装依赖**

Run:
```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && npm install
```
Expected: 安装成功，生成 `node_modules/` 与 `package-lock.json`。若报 `@dcloudio/*` 某版本 404，按 Task 1 Step 2 注释统一改版本号后重装。

- [ ] **Step 2: 编译微信小程序**

Run:
```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2/uniapp && npm run build:mp-weixin
```
Expected: 编译成功，生成 `dist/build/mp-weixin/`，其中包含 `app.json`、`app.js`、`pages/home/index.*`。

- [ ] **Step 3: 校验产物结构**

Run:
```bash
ls /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/dist/build/mp-weixin/ && cat /Users/jianzi/dev/workspace/jiajitong_v2/uniapp/dist/build/mp-weixin/app.json
```
Expected: `app.json` 的 `pages` 数组含 `"pages/home/index"`；`cloudfunctionRoot` 相关配置存在。

- [ ] **Step 4: 提交 lockfile**

```bash
cd /Users/jianzi/dev/workspace/jiajitong_v2
git add uniapp/package-lock.json
git commit -m "chore(uniapp): 锁定依赖版本, 验证 mp-weixin 编译通过"
```

---

## 验收

- `cd uniapp && npm install && npm run build:mp-weixin` 成功产出 `dist/build/mp-weixin`。
- `dist/build/mp-weixin/app.json` 含 `pages/home/index`。
- `src/manifest.json` `vueVersion: "3"`、含 `cloudfunctionRoot`。
- 目录结构对齐 spec §3。
- 真机/开发者工具预览由开发者本地完成（本环境无微信开发者工具）。

## Self-Review 记录

- **Spec 覆盖**：目标(Task3 验收)、重建方式(Task1)、目录结构(Task1/2)、四项关键决策(pages.json 单页 Task2S4 / 不接 cloud Task2S2 / appid 占位+cloudfunctionRoot Task2S5 / Pinia Task2S1)、验收标准(Task3) 均有对应任务。
- **占位扫描**：代码块均为完整内容；仅业务逻辑处保留显式 `TODO(Phase 1)` 注释，属 spec 明确的阶段边界，非计划占位。
- **类型一致**：`createApp`/`onLaunch`/`createPinia` 用法跨任务一致；npm 脚本名 `dev:mp-weixin`/`build:mp-weixin` 在 Task1 定义、Task3 使用一致。
