import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 개발 중 /api 요청을 Spring Boot 백엔드(Ma_BE, :8081)로 프록시
      '/api': 'http://localhost:8081',
    },
  },
})
