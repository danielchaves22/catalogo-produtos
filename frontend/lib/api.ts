// frontend/lib/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor para debug em desenvolvimento
if (process.env.NODE_ENV === 'development') {
  api.interceptors.request.use(config => {
    console.log('API Request:', config.method?.toUpperCase(), config.url, config.baseURL);
    return config;
  });
}

export default api