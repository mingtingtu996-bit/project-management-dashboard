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
      // 绕过 pnpm 符号链接问题，直接指定 chart.js 的真实路径
      'chart.js': path.resolve(__dirname, './node_modules/.pnpm/chart.js@4.5.1/node_modules/chart.js/dist/chart.js'),
    },
  },
  build: {
    // 关闭首屏 modulepreload，避免公网环境首屏并发拉取过多静态资源
    modulePreload: false,
    // 公网环境偶发静态资源请求失败时，优先保证首屏只依赖单一入口脚本
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
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
