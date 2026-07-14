# 家计通 · UI 原型设计规范（暖光 Bento 版）

**文档类型**：UI/UX 设计规范 + 年轻向视觉方向  
**关联文档**：[PDD 楔子版](PDD-新婚备育家庭财务规划教练.md)、[v1 专业温暖版](UI-原型设计.md)  
**文档版本**：V2.0  
**撰写日期**：2026-06-11  
**设计状态**：MVP 原型 · 年轻用户审美探索  
**可交互原型**：[`../prototype-v2/index.html`](../prototype-v2/index.html)（浏览器打开，375px 小程序视口）

> v1 原型（[`prototype/`](../prototype/)）保留不动；本版为面向 25–32 岁新婚/备育用户的视觉升级探索。

---

## 一、设计定位

| 维度 | v1 专业温暖版 | v2 暖光 Bento 版 |
|------|---------------|------------------|
| 气质 | 银行 adjacent 的可信感 | 小红书 / Arc / Linear 的年轻感 |
| 主色 | 鼠尾草绿 `#2D8B7A` | 珊瑚-蜜桃-薰衣草渐变 |
| 布局 | 传统卡片列表 | Bento 网格 + 玻璃拟态 |
| 文案 | 正式说明 | 对话式、共情（「你们小家」「有点紧」） |
| 字体 | 系统 PingFang | DM Sans + PingFang |
| 导航 | 标准 Tab | 悬浮胶囊 Tab Bar |

**核心目标**：让首次进入的用户在 3 秒内感到「这是为我这类年轻人做的」，而不是「又一个记账表格 App」。

---

## 二、设计原则

1. **暖光而非冷绿** — 用渐变与 mesh 背景传递生活感，健康分用渐变色环而非单色仪表盘。
2. **Bento 一屏多信息** — 首页/看板用不等宽网格，减少纵向滚动与表格感。
3. **轻量玻璃拟态** — 顶栏、Tab、卡片用半透明 + blur，层次清晰但不厚重。
4. **成就可视化** — 健康分、进度条、状态胶囊是「可分享的情绪符号」。
5. **对话式微文案** — 按钮与提示用第二人称，降低财务焦虑感。

---

## 三、设计系统（Design Tokens）

### 3.1 色彩

| Token | 值 | 用途 |
|-------|-----|------|
| `--grad-hero` | `#FF6B8A → #FF8A5C → #C084FC` | 落地页、分享卡背景 |
| `--grad-btn` | `#FF6B8A → #FF7E5F` | 主按钮 |
| `--grad-score` | `#FF6B8A → #A855F7` | 健康分数字渐变 |
| `--color-bg` | `#FAF8F5` | 页面暖白底 |
| `--color-coral` | `#FF6B8A` | 主强调、链接 |
| `--color-peach` | `#FF8A5C` | 次级强调、预警边线 |
| `--color-lilac` | `#A855F7` | 区块标签、折叠提示 |
| `--color-mint` | `#2DD4BF` | 正常/稳健状态 |
| `--color-amber` | `#FBBF24` | 警告 |
| `--color-danger` | `#F87171` | 超支/高风险 |

### 3.2 字体

| 层级 | 规格 | 场景 |
|------|------|------|
| Hero | 26px / 700 | 落地页标题 |
| Page | 20px / 700 | 页面标题 |
| Section | 17px / 700 | 向导步骤标题 |
| Body | 15px / 400–500 | 正文、说明 |
| Caption | 12–13px | 辅助、信任条 |
| Score XL | 48–72px / 700 | 健康分、分享卡 |

**字体栈**：`'DM Sans', -apple-system, 'PingFang SC', sans-serif`

### 3.3 圆角与阴影

| Token | 值 |
|-------|-----|
| `--radius-sm` | 12px |
| `--radius-md` | 16px |
| `--radius-lg` | 20px |
| `--radius-xl` | 28px |
| `--shadow-soft` | 珊瑚 tint 轻阴影 |
| `--shadow-card` | 中性卡片阴影 |

### 3.4 核心组件

| 组件 | 类名 | 说明 |
|------|------|------|
| 渐变主按钮 | `.grad-btn` | 全宽胶囊，按压缩放反馈 |
| 玻璃卡片 | `.glass-card` | 白底 + 轻阴影，可选 accent/tip 变体 |
| 选项卡片 | `.pick-card` | 向导单选，选中珊瑚描边 |
| 胶囊选项 | `.pill-option` | 横向/纵向 pill 组 |
| 状态胶囊 | `.status-pill-ok/warn/danger` | 稳健/偏高/危险 |
| Bento 格 | `.bento-grid` | 2 列网格，`.bento-cell-wide` 通栏 |
| 悬浮 Tab | `.float-nav` + `.float-nav-item` | 底部胶囊导航 |
| 进度条 | `.track-bar` + `.track-fill-*` | 分类预算追踪 |
| 健康分环 | `.score-display` + SVG ring | 进入页时数字递增动画 |

---

## 四、页面清单（31 屏）

与 v1 信息架构一致，视觉与文案升级：

| 模块 | 页面 ID | 要点 |
|------|---------|------|
| 获客 | landing, quick-1~3, quick-result | Mesh 背景 + 渐变插画；3 步快测 |
| 登录 | login | 品牌渐变字 + 微信绿按钮 |
| 向导 | wizard-1~5, wizard-3-warn, wizard-loading | 步骤 pip + pick-card；收支预警用 stat-strip |
| 报告 | report, report-full, share | 分环健康分；分享卡全幅渐变 |
| 主 Tab | home, dashboard, profile (+ 空态) | Bento 首页；看板 category-cell |
| 追踪 | weekly, actions, review | 7 类周填报；行动 tag-btn |
| 增长 | partner, paywall, setup-reminder | 伴侣邀请；Pro 价格卡 featured |
| 设置 | family-profile, privacy | 档案 kv-list |
| 异常 | error-city, error-imbalance | alert-banner + 引导修改 |

---

## 五、与 v1 选型建议

| 场景 | 建议 |
|------|------|
| 对内评审 / 投资人 | v1 更稳、更「财务可信」 |
| 用户测试 / 小红书投放 | v2 更吸年轻用户 |
| 微信小程序最终实现 | 可混用：v1 的报告页结构 + v2 的色彩与 Bento 首页 |

---

## 六、文件结构

```
prototype-v2/
├── index.html      # 31 屏 template + 预览壳
├── styles.css      # Design tokens + 基础组件
├── components.css  # 页面级布局与 HTML 类名
└── app.js          # 导航、pick-card/pill 交互、分数动画
```

浏览器直接打开 `index.html` 即可；左侧导航切换页面，页内 `data-go` 按钮可串联主流程。
