// frontend/contexts/AuthContext.tsx
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

  // Carrega token e busca perfil apenas uma vez durante inicialização
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        
        if (!storedToken) {
          setIsLoading(false);
          return;
        }
        
        setToken(storedToken);
        
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        
        setUser(response.data);
      } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        // Se houver erro, limpa o token
        localStorage.removeItem('token');
        document.cookie = 'token=; Max-Age=0; path=/';
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAuth();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: userData } = res.data;

    // Armazena token
    localStorage.setItem('token', newToken);
    document.cookie = `token=${newToken}; path=/; max-age=${60*60}`; // 1 hora

    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    document.cookie = 'token=; Max-Age=0; path=/';
    setToken(null);
    setUser(null);
    window.location.href = '/login';
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