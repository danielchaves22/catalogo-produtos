// frontend/lib/api.ts - VERSÃO CORRIGIDA
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
})

// Interceptor de Request - Adicionar token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// NOVO: Interceptor de Response - Tratar token inválido/expirado
api.interceptors.response.use(
  // Sucesso - retorna a resposta normalmente
  (response) => {
    return response;
  },
  
  // Erro - verifica se é problema de autenticação
  (error) => {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.error;
    
    // Lista de erros que indicam problema de autenticação
    const authErrors = [
      'Token não fornecido',
      'Token inválido',
      'Token mal formatado',
      'Erro no formato do token',
      'Token expirado',
      'jwt expired',
      'jwt malformed',
      'invalid token'
    ];
    
    // Verifica se é erro 401 OU se a mensagem indica problema de autenticação
    const isAuthError = status === 401 || 
      (errorMessage && authErrors.some(authError => 
        errorMessage.toLowerCase().includes(authError.toLowerCase())
      ));
    
    if (isAuthError) {
      console.log('🔒 Token inválido/expirado detectado - redirecionando para login');
      
      // Limpar dados de autenticação
      localStorage.removeItem('token');
      document.cookie = 'token=; Max-Age=0; path=/';
      
      // Redirecionar para login preservando a rota atual
      const currentPath = window.location.pathname + window.location.search;
      const loginUrl = `/login${currentPath !== '/login' ? `?redirect=${encodeURIComponent(currentPath)}` : ''}`;
      
      // Usar replace para não adicionar à história do navegador
      window.location.replace(loginUrl);
      
      // Retornar erro customizado para evitar que componentes processem a resposta
      return Promise.reject(new Error('REDIRECT_TO_LOGIN'));
    }
    
    // Se não for erro de autenticação, propagar o erro normalmente
    return Promise.reject(error);
  }
)

// Interceptor para debug em desenvolvimento
if (process.env.NODE_ENV === 'development') {
  api.interceptors.request.use(config => {
    console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
    return config;
  });
  
  api.interceptors.response.use(
    response => {
      console.log('✅ API Response:', response.status, response.config.url);
      return response;
    },
    error => {
      if (error.message !== 'REDIRECT_TO_LOGIN') {
        console.log('❌ API Error:', error.response?.status, error.response?.config.url, error.response?.data);
      }
      return Promise.reject(error);
    }
  );
}

export default api