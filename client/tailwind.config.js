/** @type {import('tailwindcss').Config} */
// =============================================================================
// Design Token 对齐说明（V4 设计规范）
// 来源：UI设计方案_V4_最终版.html / integration/DESIGN_SPEC.md
// 更新日期：2026-03-25
// -----------------------------------------------------------------------------
// 核心变更：
// 1. --radius 从 0.5rem(8px) → 0.75rem(12px)，对齐 V4 rounded-xl 统一圆角
// 2. 清理未使用的自定义颜色/阴影 alias，统一回归 Tailwind 原生色阶与原生阴影
// 3. 新增动效：fadeIn / skeleton-loading / expand-content / slide-in
// 4. borderRadius 新增 card token，并将历史 rounded-2xl 写法统一映射到 12px
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
      // 规则：保留 shadcn 语义变量；页面配色统一直接使用 Tailwind 原生色阶
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
      },

      // -----------------------------------------------------------------------
      // 圆角 Token
      // V4 规范：卡片统一 12px
      // shadcn 默认 rounded-lg = var(--radius) = 8px → 已在 index.css 改为 0.75rem
      // -----------------------------------------------------------------------
      borderRadius: {
        lg: "var(--radius)",           // shadcn default，现为 0.75rem (12px)
        md: "calc(var(--radius) - 2px)", // 0.625rem (10px)
        sm: "calc(var(--radius) - 4px)", // 0.5rem (8px)
        card: "var(--radius)",        // 语义化卡片圆角 token = 12px
        "2xl": "var(--radius)",       // 历史 rounded-2xl 写法统一回收为 12px
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

    },
  },
  plugins: [require("tailwindcss-animate")],
}
