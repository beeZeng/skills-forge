import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'lucide-react'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Browser preview fallback when Electron IPC is unavailable
      '/__skillhub': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__skillhub/, ''),
        // Persist SkillHub SESSION / XSRF for browser-dev auth fallback
        cookieDomainRewrite: '127.0.0.1',
      },
      '/__clawhub': {
        target: 'https://clawhub.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__clawhub/, ''),
      },
      '/__skillsmp': {
        target: 'https://skillsmp.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__skillsmp/, ''),
      },
      '/__palebluedot': {
        target: 'https://skills.palebluedot.live',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__palebluedot/, ''),
      },
      '/__xfyun': {
        target: 'https://skill.xfyun.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__xfyun/, ''),
      },
    },
  },
  base: './',
})
