# Design Tokens — V4 规范对照表

> 对齐来源：`C:\Users\jjj64\WorkBuddy\20260323153938\UI设计方案_V4_最终版.html`  
> 规范文档：`C:\Users\jjj64\WorkBuddy\20260323212655\integration\DESIGN_SPEC.md`  
> 更新日期：2026-03-25  

---

## 一、圆角（Border Radius）

| Token | 值 | 用途 |
|-------|-----|------|
| `rounded-sm` | 8px（`calc(var(--radius) - 4px)`）| 小按钮、badge |
| `rounded-md` | 10px（`calc(var(--radius) - 2px)`）| 输入框、次要按钮 |
| `rounded-lg` | **12px**（`var(--radius)`）| shadcn 组件默认，等同 `rounded-xl` |
| `rounded-xl` | 12px | **V4 卡片统一圆角（直接用这个）** |
| `rounded-2xl` | 16px | 大弹窗、浮层面板 |
| `rounded-full` | 9999px | 徽章、头像、进度条端点 |

> ⚠️ **`--radius` 已从 0.5rem 改为 0.75rem**，`rounded-lg` 现在等于 12px，与 `rounded-xl` 一致。  
> 后续新代码统一写 `rounded-xl`，不要写 `rounded-lg`（避免混淆）。

---

## 二、颜色

### 2.1 直接用 Tailwind 原色（推荐方式）

V4 设计稿直接使用 Tailwind 原生色阶，**不需要自定义颜色**，按以下规则写即可：

| 场景 | 类名 | 说明 |
|------|------|------|
| 主按钮 | `bg-blue-600` `hover:bg-blue-700` | 品牌蓝 |
| 激活背景 | `bg-blue-50` | 低权重高亮 |
| 已完成进度条 | `bg-emerald-500` | ✅ 必须用 emerald，不要用 green |
| 进行中进度条 | `bg-blue-500` | |
| 未开始/待办 | `bg-amber-500` | |
| 延期/逾期 | `bg-red-500` | |
| 受阻边框 | `border-l-4 border-l-amber-400` | |
| Sidebar | `bg-gray-900` | 深色 #111827 |
| 页面背景 | `bg-gray-50` | 主内容区 |
| 卡片背景 | `bg-white` | |
| 卡片边框 | `border border-gray-100` | |

### 2.2 语义别名（tailwind.config.js 中已定义）

仅在需要集中管理时使用，平时直接用上面的原色类即可。

| 别名 | 对应原色 |
|------|---------|
| `bg-status-done` | `bg-emerald-500` |
| `bg-status-delayed` | `bg-red-500` |
| `bg-milestone-lv1` / `border-milestone-lv1` | `#F59E0B` (amber-500) |
| `bg-milestone-lv2` / `border-milestone-lv2` | `#3B82F6` (blue-500) |
| `bg-milestone-lv3` / `border-milestone-lv3` | `#9CA3AF` (gray-400) |
| `bg-risk-high-bg` / `border-risk-high-border` | `bg-red-50` / `border-red-500` |

---

## 三、字体/文字

| 用途 | 类名 |
|------|------|
| 页面标题 | `text-xl font-semibold text-gray-800` |
| 卡片标题 | `text-base font-semibold text-gray-800` |
| 正文 | `text-sm text-gray-700` |
| 辅助文字 | `text-sm text-gray-600` |
| 提示/占位 | `text-sm text-gray-500` |
| 数字（统计卡片） | `text-2xl font-bold text-gray-700` |
| WBS编码 | `text-xs text-gray-400 font-mono` |
| 徽章文字 | `text-xs font-medium` |

---

## 四、间距

| 用途 | 值 |
|------|-----|
| 页面内边距 | `p-6`（24px）|
| 卡片内边距 | `p-6`（24px）|
| 统计卡片内边距 | `p-5`（20px）|
| 卡片间距 | `gap-4`（16px）或 `gap-6`（24px）|
| 模块间距 | `mb-6`（24px）|
| 表单项间距 | `space-y-4`（16px）|
| 列表项间距 | `space-y-3`（12px）|
| WBS树形缩进 | `24px` 每深一层 |

---

## 五、阴影

| 用途 | 类名 |
|------|------|
| 卡片默认 | `shadow-sm` |
| 卡片 hover | `hover:shadow-md` |
| 弹窗/浮层 | `shadow-lg` |

---

## 六、动效

| 名称 | 类名 | 用途 |
|------|------|------|
| 页面淡入 | `animate-fade-in`（0.3s ease-out）| 页面切换、卡片出现 |
| 快速淡入 | `animate-fade-in-fast`（0.15s）| Tooltip、小弹窗 |
| 骨架屏 | `animate-skeleton`（1.5s linear infinite）| 加载占位 |
| 子菜单展开 | `animate-expand-down` / `animate-collapse-up` | Sidebar 折叠菜单 |
| 从右滑入 | `animate-slide-in-right`（0.2s）| 详情面板 |
| 通用过渡 | `transition-all duration-200` | 颜色/阴影变化 |

---

## 七、复用工具类（index.css @layer components）

不需要每次写长串类，直接用这些：

| 类名 | 等效写法 |
|------|---------|
| `.card-v4` | 标准白色卡片（rounded-xl shadow-sm border-gray-100 p-6 + hover效果）|
| `.card-v4-sm` | 紧凑版卡片（p-4，用于统计卡片）|
| `.skeleton-block` | 骨架屏占位块 |
| `.badge-base` | 徽章基础（inline-flex items-center px-2 py-0.5 rounded-full text-xs）|
| `.progress-bar` | 进度条容器（flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden）|
| `.ms-lv1` / `.ms-lv2` / `.ms-lv3` | 里程碑层级左边框（amber/blue/gray）|
| `.risk-high` / `.risk-mid` / `.risk-low` | 风险等级卡片背景+左边框 |
| `.tab-active` / `.tab-inactive` | Tab 下划线激活/非激活态 |
| `.page-enter` | 页面进入动效（animate-fade-in）|

---

## 八、组件快查

### 卡片（Card）
```tsx
// 标准卡片
<div className="card-v4">...</div>

// 或完整写法
<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md hover:ring-1 hover:ring-blue-100">
```

### 进度条
```tsx
<div className="progress-bar">
  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
</div>
```

### 状态徽章
```tsx
// 已完成
<span className="badge-base bg-green-100 text-green-700">已完成</span>
// 进行中
<span className="badge-base bg-blue-100 text-blue-700">进行中</span>
// 逾期
<span className="badge-base rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">逾期</span>
```

### Tab
```tsx
<div className="border-b flex gap-4 px-6">
  <button className="tab-active">全部 <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">8</span></button>
  <button className="tab-inactive">已完成</button>
</div>
```

### 骨架屏
```tsx
<div className="skeleton-block h-4 w-32 mb-2" />
<div className="skeleton-block h-3 w-48" />
```
