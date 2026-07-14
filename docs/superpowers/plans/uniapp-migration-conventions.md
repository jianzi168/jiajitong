# uniapp 页面还原规范（子 agent 必读）

目标：把 `prototype-v2/index.html` 的屏一比一还原为 uni-app（Vue3 setup）微信小程序页面。

## 必读参考文件（先全部读一遍）
- 原型模板：`/Users/jianzi/dev/workspace/jiajitong_v2/prototype-v2/index.html`（各屏在 `<template id="tpl-xxx">` 内）
- 原型样式：`/Users/jianzi/dev/workspace/jiajitong_v2/prototype-v2/styles.css` 和 `components.css`（还原时的数值来源）
- 已迁移的全局样式（**类名的唯一事实源**）：`/Users/jianzi/dev/workspace/jiajitong_v2/uniapp/src/styles/common.scss` 和 `tokens.scss`
- 样板页（**照这个风格写**）：`/Users/jianzi/dev/workspace/jiajitong_v2/uniapp/src/pages/quick/result.vue`
- 公共组件：`components/NavBar.vue`、`components/FloatNav.vue`、`components/ScoreRing.vue`

## 铁律
1. **单位换算**：原型是 px（375 设计稿），uni 用 **rpx，数值 ×2**。common.scss 里已迁的类直接复用，不要重写。
2. **标签映射**：`<div>→<view>`、`<span>/<p>/<h1..>/<small>/<strong>→<text>`、`<button>` 保留、`<img>→<image>`、`<input>` 保留、`<label>→<view>`。
3. **文本必须在 `<text>` 里**：小程序中 `<view>` 直接放文字可以，但样式里凡是 `strong`/`p`/`small` 等标签选择器**一律不支持**，改成 class。common.scss 已把这些改成 class（如 `.tip-strong`、`.ac-p`、`.kv-val`、`.risk-v`、`.wt-val`、`.pick-title`、`.pick-desc`、`.profile-name`、`.metric-cell`、`.numbered-list .li`、`.check-list .li` 等）——**用这些 class，不要用标签选择器**。
4. **事件禁止在模板里调 uni**：`@tap="uni.showToast(...)"` 会报 `undefined`。必须在 `<script setup>` 里定义方法再绑定，例如 `@tap="onLogin"`。
5. **顶部导航**：凡原型有 `screen-header`（带返回箭头的头部）的屏，用 `<NavBar title="xxx" />`（它已处理状态栏避让+返回）。原型里 `screen-header-simple`（Tab 页无返回、只有标题+右侧链接）的屏，不用 NavBar，自己写一个简单头部：外层 `view` 加 `padding-top` 用状态栏高度避让（参考下方模板）。
6. **底部 Tab**：`home`/`dashboard`/`profile` 三个 Tab 页底部放 `<FloatNav active="home|dashboard|profile" />`，页面 body 用 `screen-body-tab`（留出底部间距）。
7. **评分环**：用 `<ScoreRing :score="78" size="lg|sm" />`（不要自己画 SVG）。
8. **路由跳转**：原型的 `data-go="xxx"` 翻译成 `uni.navigateTo({ url: '/pages/...' })`。Tab 间跳转用 `uni.reLaunch`。返回用 NavBar 内置。跳转目标路径见下方「路由表」。所有跳转方法写在 script 里。
9. **列表渲染**：原型里重复结构（如预算行、分类进度）用 `v-for` + 本地静态数组还原，数据用原型里的假值。
10. **inline SVG 图标**：原型模板里的装饰性 inline `<svg>` 图标，小程序 WXML 不支持。简单处理：用一个占位 `<view>` 或 emoji 近似，或省略图标只保留布局。**不要**把 inline svg 直接写进 wxml。评分环除外（用 ScoreRing 组件）。
11. **`:active` 代替 `:hover`**；`backdrop-filter` 保留（common.scss 已含）。
12. 页面根元素统一 `<view class="screen">`；背景需要 mesh 渐变的屏在 body 上加 `mesh-bg` class（如 landing、loading、share、profile-banner）。

## Tab 页简单头部模板（无返回）
```vue
<script setup>
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 20
</script>
<template>
  <view class="screen">
    <view class="simple-header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <text class="page-title">晓雯的家庭</text>
      <text class="text-link" @tap="onXxx">重新测算</text>
    </view>
    <view class="screen-body screen-body-scroll screen-body-tab"> ... </view>
    <FloatNav active="home" />
  </view>
</template>
<style>
.simple-header { display:flex; align-items:center; justify-content:space-between; padding:16rpx 40rpx; }
</style>
```

## 路由表（data-go → uni 路径）
- landing → `/pages/landing/index`
- quick-1/2/3 → `/pages/quick/step1|step2|step3`
- quick-result → `/pages/quick/result`
- login → `/pages/login/index`
- wizard-1..5 → `/subpackages/wizard/step1..step5`
- wizard-3-warn → `/subpackages/wizard/step3-warn`
- wizard-loading → `/subpackages/wizard/loading`
- report → `/subpackages/report/preview`
- report-full → `/subpackages/report/full`
- share → `/subpackages/report/share`
- home → `/pages/home/index`（reLaunch）
- home-empty → `/pages/home/empty`
- dashboard → `/pages/dashboard/index`（reLaunch）
- dashboard-empty → `/pages/dashboard/empty`
- profile → `/pages/profile/index`（reLaunch）
- weekly → `/pages/weekly/index`
- actions → `/pages/actions/index`
- partner → `/pages/partner/index`
- review → `/pages/review/index`
- paywall → `/pages/paywall/index`
- setup-reminder → `/pages/setup-reminder/index`
- family-profile → `/pages/family/index`
- privacy → `/pages/privacy/index`
- error-city → `/pages/error/city`
- error-imbalance → `/pages/error/imbalance`

## 交付
- 只创建分配给你的 `.vue` 页面文件，**不要**改 common.scss / tokens.scss / pages.json / 公共组件 / 其他 agent 的页面。
- 页面内私有样式写在页面 `<style>` 里；能用 common.scss 已有 class 的就复用，不要重复定义。
- 完成后返回：创建了哪些文件、每屏用到的关键 class、有无偏离原型之处（≤150 字）。
