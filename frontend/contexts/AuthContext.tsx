// frontend/contexts/AuthContext.tsx - VERSÃO SEGURA
import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react'
import api from '@/lib/api'

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextData {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

// CONSTANTES DE SEGURANÇA
const TOKEN_KEY = 'catalogo_produtos_token'; // Nome específico para evitar conflitos
const COOKIE_NAME = 'catalogo_produtos_auth'; // Nome específico do cookie

// Função segura para definir cookies
function setSecureCookie(name: string, value: string, days: number = 1) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  
  // CONFIGURAÇÕES DE SEGURANÇA OBRIGATÓRIAS
  const cookieOptions = [
    `${name}=${value}`,
    `expires=${expires.toUTCString()}`,
    'path=/', // Apenas para este domínio
    'SameSite=Strict', // CRÍTICO: Previne ataques CSRF
    'Secure' // Apenas HTTPS em produção
  ];
  
  // Em desenvolvimento local (HTTP), remover Secure
  if (window.location.protocol === 'http:' && window.location.hostname === 'localhost') {
    cookieOptions.pop(); // Remove 'Secure' em desenvolvimento
  }
  
  document.cookie = cookieOptions.join('; ');
}

// Função segura para remover cookies
function removeSecureCookie(name: string) {
  const cookieOptions = [
    `${name}=`,
    'expires=Thu, 01 Jan 1970 00:00:00 UTC',
    'path=/',
    'SameSite=Strict'
  ];
  
  document.cookie = cookieOptions.join('; ');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string|null>(null);
  const [user, setUser] = useState<User|null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega token do localStorage com chave específica
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        fetchUserProfile(storedToken);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Erro ao acessar localStorage:', error);
      setIsLoading(false);
    }
  }, []);

  // Busca perfil do usuário quando o token é carregado
  async function fetchUserProfile(authToken: string) {
    try {
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setUser(response.data);
    } catch (error: any) {
      console.error('Erro ao carregar perfil:', error);
      
      // Se o erro foi um redirecionamento para login, não processar
      if (error.message === 'REDIRECT_TO_LOGIN') {
        return;
      }
      
      // Se houver erro, limpa apenas NOSSOS dados
      clearAuthData();
    } finally {
      setIsLoading(false);
    }
  }

  // Função segura para limpar apenas nossos dados
  function clearAuthData() {
    try {
      localStorage.removeItem(TOKEN_KEY); // Apenas nossa chave específica
      removeSecureCookie(COOKIE_NAME); // Apenas nosso cookie específico
      setToken(null);
      setUser(null);
    } catch (error) {
      console.error('Erro ao limpar dados de autenticação:', error);
    }
  }

  async function login(email: string, password: string) {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token: newToken, user: userData } = res.data;

      // Armazena token com chave específica
      localStorage.setItem(TOKEN_KEY, newToken);
      
      // Define cookie seguro
      setSecureCookie(COOKIE_NAME, newToken);

      setToken(newToken);
      setUser(userData);
    } catch (error: any) {
      // Se o erro foi um redirecionamento, não processar
      if (error.message === 'REDIRECT_TO_LOGIN') {
        return;
      }
      
      // Propagar outros erros para o componente de login
      throw error;
    }
  }

  function logout() {
    // Limpar apenas nossos dados
    clearAuthData();
    
    // Usar replace para não adicionar à história
    window.location.replace('/login');
  }

  return (
    <AuthContext.Provider
      value={{ token, user, login, logout, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}