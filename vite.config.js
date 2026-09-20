import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 개발 중 /api 요청을 배포된 백엔드(Ma_BE, Render)로 프록시
      '/api': {
        target: 'https://ma-be-1.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
