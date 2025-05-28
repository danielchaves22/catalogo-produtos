// frontend/contexts/AuthContext.tsx - VERSÃO MELHORADA
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string|null>(null);
  const [user, setUser] = useState<User|null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega token do localStorage
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) {
      setToken(t);
      fetchUserProfile(t);
    } else {
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
      
      // NOVO: Se o erro foi um redirecionamento para login, não processar
      if (error.message === 'REDIRECT_TO_LOGIN') {
        return;
      }
      
      // Se houver erro, limpa o token
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token: newToken, user: userData } = res.data;

      // Armazena token
      localStorage.setItem('token', newToken);
      document.cookie = `token=${newToken}; path=/`;

      setToken(newToken);
      setUser(userData);
    } catch (error: any) {
      // NOVO: Se o erro foi um redirecionamento, não processar
      if (error.message === 'REDIRECT_TO_LOGIN') {
        return;
      }
      
      // Propagar outros erros para o componente de login
      throw error;
    }
  }

  function logout() {
    localStorage.removeItem('token');
    document.cookie = 'token=; Max-Age=0; path=/';
    setToken(null);
    setUser(null);
    
    // NOVO: Usar replace para não adicionar à história
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