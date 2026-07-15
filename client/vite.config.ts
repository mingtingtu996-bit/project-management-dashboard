import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  // 部署到根目录
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // 关闭首屏 modulepreload，避免公网环境首屏并发拉取过多静态资源。
    // 路由与重型能力仍保留动态拆包，避免 BI 页面继续膨胀首包。
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          const normalizedId = id.replace(/\\/g, '/')

          if (normalizedId.includes('/react/')
            || normalizedId.includes('/react-dom/')
            || normalizedId.includes('/scheduler/')
            || normalizedId.includes('/react-router')
          ) return 'vendor-react'
          if (normalizedId.includes('/@supabase/')) return 'vendor-supabase'
          if (normalizedId.includes('/@radix-ui/')) return 'vendor-radix'
          if (normalizedId.includes('/@dnd-kit/')) return 'vendor-dnd'
          if (normalizedId.includes('/chart.js/') || normalizedId.includes('/react-chartjs-2/')) return 'vendor-charts'
          if (normalizedId.includes('/xlsx/')) return 'vendor-xlsx'

          return undefined
        },
      },
    },
    // SheetJS is intentionally isolated as a lazy spreadsheet-only chunk.
    // Keep the global warning close to the 500 kB default while allowing that fixed vendor boundary.
    chunkSizeWarningLimit: 510,
    // 启用CSS代码分割
    cssCodeSplit: true,
    // 启用源代码映射（生产环境可关闭）
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  // 依赖优化
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'chart.js'],
  },
})
