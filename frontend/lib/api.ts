// frontend/lib/api.ts - VERSÃO SEGURA COM LOGS PARA DEBUG DOCKER
import axios from 'axios'

// CONSTANTES DE SEGURANÇA - devem coincidir com AuthContext
const TOKEN_KEY = 'catalogo_produtos_token';
const COOKIE_NAME = 'catalogo_produtos_auth';

// Detectar ambiente e configurar baseURL
const getBaseURL = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  const defaultUrl = 'http://localhost:3000/api' // CORRIGIDO: era loucahost
  
  const baseURL = envUrl || defaultUrl
  
  // Log detalhado da configuração (apenas em dev ou se houver problemas)
  if (process.env.NODE_ENV === 'development' || !envUrl) {
    console.group('🔧 API Configuration')
    console.log('Environment:', process.env.NODE_ENV)
    console.log('NEXT_PUBLIC_API_URL:', envUrl)
    console.log('Final baseURL:', baseURL)
    console.log('Window location:', typeof window !== 'undefined' ? window.location.href : 'SSR')
    if (!envUrl) {
      console.warn('⚠️  NEXT_PUBLIC_API_URL não definida, usando:', defaultUrl)
    }
    console.groupEnd()
  }
  
  return baseURL
}

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000, // 10 segundos
  headers: {
    'Content-Type': 'application/json',
  }
})

// Função segura para remover apenas nossos dados
function clearOurAuthData() {
  try {
    // Remove apenas nossa chave específica do localStorage
    localStorage.removeItem(TOKEN_KEY);
    
    // Remove apenas nosso cookie específico
    const cookieOptions = [
      `${COOKIE_NAME}=`,
      'expires=Thu, 01 Jan 1970 00:00:00 UTC',
      'path=/',
      'SameSite=Strict'
    ];
    document.cookie = cookieOptions.join('; ');
    
    console.log('🧹 Dados de autenticação da aplicação limpos com segurança');
  } catch (error) {
    console.error('Erro ao limpar dados de autenticação:', error);
  }
}

// Interceptor de Request - Adicionar token e logs para debug
api.interceptors.request.use(
  config => {
    try {
      const token = localStorage.getItem(TOKEN_KEY); // Usar chave específica
      
      // Logs para debug (apenas em desenvolvimento ou quando há problemas)
      if (process.env.NODE_ENV === 'development') {
        console.group(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`)
        console.log('Full URL:', `${config.baseURL}${config.url}`)
        console.log('Headers:', config.headers)
        console.log('Data:', config.data)
        console.log('Token present:', !!token)
        console.groupEnd()
      }
      
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('❌ Request Error:', error);
    }
    return config;
  },
  error => {
    console.error('❌ Request Setup Error:', error)
    return Promise.reject(error)
  }
)

// Interceptor de Response - Tratar token inválido/expirado COM SEGURANÇA + logs
api.interceptors.response.use(
  // Sucesso - retorna a resposta normalmente
  (response) => {
    // Log de sucesso (apenas em desenvolvimento)
    if (process.env.NODE_ENV === 'development') {
      console.group(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`)
      console.log('Status:', response.status)
      console.log('Data:', response.data)
      console.groupEnd()
    }
    
    return response;
  },
  
  // Erro - verifica se é problema de autenticação + logs detalhados
  (error) => {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.error;
    
    // Log detalhado de erro
    if (process.env.NODE_ENV === 'development') {
      console.group(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`)
      console.log('Error message:', error.message)
      console.log('Error code:', error.code)
      
      if (error.response) {
        console.log('Response status:', error.response.status)
        console.log('Response data:', error.response.data)
      } else if (error.request) {
        console.log('No response received:', error.request)
        console.log('Request was made but no response')
      }
      
      // Logs específicos para problemas de conexão Docker
      if (error.code === 'ECONNREFUSED') {
        console.error('🔌 CONNECTION REFUSED - Backend não está acessível!')
        console.error('Verifique se o backend está rodando e acessível')
        console.error('URL tentada:', `${error.config?.baseURL}${error.config?.url}`)
        console.error('💡 Se usando Docker, verifique NEXT_PUBLIC_API_URL=http://backend:3000/api')
      }
      
      if (error.code === 'ENOTFOUND') {
        console.error('🌐 DNS ERROR - Host não encontrado!')
        console.error('Verifique a configuração de rede do Docker')
      }
      
      if (error.message?.includes('timeout')) {
        console.error('⏰ TIMEOUT - Resposta demorou mais que 10s')
      }
      
      console.groupEnd()
    }
    
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
      console.log('🔒 Token inválido/expirado detectado - limpando apenas dados da aplicação');
      
      // CRÍTICO: Limpar apenas nossos dados, não todos os dados do navegador
      clearOurAuthData();
      
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

// Função de health check para debug
export const healthCheck = async () => {
  try {
    console.log('🏥 Executando health check...')
    const response = await api.get('/health')
    console.log('✅ Backend está funcionando:', response.data)
    return true
  } catch (error) {
    console.error('❌ Backend não está acessível:', error)
    return false
  }
}

// Função para testar conectividade Docker
export const testConnection = async () => {
  console.group('🔍 Teste de Conectividade Docker')
  
  try {
    // Teste 1: Health check
    console.log('Teste 1: Health Check')
    await healthCheck()
    
    // Teste 2: Endpoint específico
    console.log('Teste 2: Teste de endpoint /api/test')
    const testResponse = await api.get('/test')
    console.log('✅ Endpoint test funcionando:', testResponse.data)
    
  } catch (error: any) {
    console.error('❌ Falha nos testes de conectividade')
    
    // Diagnóstico adicional para Docker
    if (typeof window !== 'undefined') {
      console.log('🌐 Informações do ambiente:')
      console.log('- Location:', window.location.href)
      console.log('- Protocol:', window.location.protocol)
      console.log('- Host:', window.location.host)
      console.log('- API Base URL:', api.defaults.baseURL)
    }
    
    // Sugestões baseadas no erro
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Soluções para Docker:')
      console.log('1. Verificar se backend está rodando: docker-compose ps')
      console.log('2. Verificar variável NEXT_PUBLIC_API_URL no .env.docker')
      console.log('3. Deve ser: NEXT_PUBLIC_API_URL=http://backend:3000/api')
      console.log('4. Reconstruir se necessário: docker-compose build --no-cache')
    }
  }
  
  console.groupEnd()
}

// Log inicial ao carregar o módulo (apenas em dev)
if (process.env.NODE_ENV === 'development') {
  console.log('📡 API module loaded with base URL:', api.defaults.baseURL)
}

export default api