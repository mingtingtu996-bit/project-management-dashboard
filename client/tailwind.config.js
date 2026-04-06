/** @type {import('tailwindcss').Config} */
// =============================================================================
// Design Token 对齐说明（V4 设计规范）
// 来源：UI设计方案_V4_最终版.html / integration/DESIGN_SPEC.md
// 更新日期：2026-03-25
// -----------------------------------------------------------------------------
// 核心变更：
// 1. --radius 从 0.5rem(8px) → 0.75rem(12px)，对齐 V4 rounded-xl 统一圆角
// 2. 新增 design token 颜色别名：brand / status / risk / milestone
// 3. 新增动效：fadeIn / skeleton-loading / expand-content / slide-in
// 4. borderRadius 新增 xl2 对应 rounded-2xl(16px) 少量使用场景
// =============================================================================

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // -----------------------------------------------------------------------
      // 颜色 Token
      // 规则：shadcn 语义变量保持不变（兼容组件库），在此基础上追加 V4 专用别名
      // -----------------------------------------------------------------------
      colors: {
        // shadcn 语义变量（不动）
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // V4 品牌色别名
        // 用法：bg-brand-primary / text-brand-primary
        brand: {
          primary: "#2563EB",    // blue-600：主按钮、激活态
          "primary-light": "#EFF6FF", // blue-50：激活背景
          "primary-ring": "#BFDBFE",  // blue-100：hover ring
        },

        // V4 状态色别名（进度条/徽章颜色）
        // 用法：bg-status-done / text-status-delayed
        status: {
          done: "#10B981",       // emerald-500：已完成
          "done-bg": "#D1FAE5",  // emerald-100
          "done-text": "#065F46",// emerald-800
          active: "#3B82F6",     // blue-500：进行中
          "active-bg": "#DBEAFE",
          "active-text": "#1D4ED8",
          pending: "#F59E0B",    // amber-500：未开始/待办
          "pending-bg": "#FEF3C7",
          "pending-text": "#92400E",
          delayed: "#EF4444",    // red-500：延期/逾期
          "delayed-bg": "#FEE2E2",
          "delayed-text": "#991B1B",
          blocked: "#FBBF24",    // amber-400：受阻边框
        },

        // V4 风险等级色别名
        // 用法：bg-risk-high / border-risk-high
        risk: {
          "high-bg": "#FEF2F2",  // red-50
          "high-border": "#EF4444", // red-500
          "high-text": "#DC2626",
          "mid-bg": "#FFF7ED",   // orange-50
          "mid-border": "#F97316", // orange-500
          "mid-text": "#C2410C",
          "low-bg": "#EFF6FF",   // blue-50
          "low-border": "#3B82F6", // blue-500
          "low-text": "#1D4ED8",
        },

        // V4 里程碑层级色别名
        // 用法：border-ms-lv1 / text-ms-lv1
        milestone: {
          lv1: "#F59E0B",        // amber-500：一级
          lv2: "#3B82F6",        // blue-500：二级
          lv3: "#9CA3AF",        // gray-400：三级
        },

        // V4 界面骨架色
        sidebar: "#111827",      // gray-900：Sidebar 背景
        "page-bg": "#F9FAFB",    // gray-50：页面背景
      },

      // -----------------------------------------------------------------------
      // 圆角 Token
      // V4 规范：卡片统一 rounded-xl (12px)
      // shadcn 默认 rounded-lg = var(--radius) = 8px → 已在 index.css 改为 0.75rem
      // -----------------------------------------------------------------------
      borderRadius: {
        lg: "var(--radius)",           // shadcn default，现为 0.75rem (12px)
        md: "calc(var(--radius) - 2px)", // 0.625rem (10px)
        sm: "calc(var(--radius) - 4px)", // 0.5rem (8px)
        xl2: "1rem",                   // 16px，少数大卡片
      },

      // -----------------------------------------------------------------------
      // 动效 Token
      // V4 规范：fadeIn 0.3s / skeleton-loading 1.5s / expand max-height
      // -----------------------------------------------------------------------
      keyframes: {
        // shadcn accordion（保留）
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // V4 页面/卡片淡入
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // V4 骨架屏光晕
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "calc(200px + 100%) 0" },
        },
        // V4 侧边栏子菜单展开（max-height）
        "expand-down": {
          from: { maxHeight: "0", opacity: "0" },
          to: { maxHeight: "200px", opacity: "1" },
        },
        "collapse-up": {
          from: { maxHeight: "200px", opacity: "1" },
          to: { maxHeight: "0", opacity: "0" },
        },
        // V4 抽屉/卡片从右侧滑入
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        // shadcn accordion（保留）
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // V4 动效
        "fade-in": "fade-in 0.3s ease-out",
        "fade-in-fast": "fade-in 0.15s ease-out",
        "skeleton": "skeleton-shimmer 1.5s linear infinite",
        "expand-down": "expand-down 0.2s ease-out",
        "collapse-up": "collapse-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
      },

      // -----------------------------------------------------------------------
      // 阴影 Token
      // V4 规范：卡片用 shadow-sm，hover 升级 shadow-md
      // 以下是语义别名，直接用 shadow-sm/shadow-md 也可以
      // -----------------------------------------------------------------------
      boxShadow: {
        card: "0 1px 2px 0 rgba(0,0,0,0.05)",       // = shadow-sm
        "card-hover": "0 4px 6px -1px rgba(0,0,0,0.07)", // = shadow-md
        "health-glow": "0 0 0 3px rgba(16,185,129,0.15)", // 健康度卡片绿光
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
