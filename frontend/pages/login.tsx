// frontend/pages/login.tsx
import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { PageLoader } from '@/components/ui/PageLoader'

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { redirect } = router.query as { redirect?: string };
  const { isLoading } = useProtectedRoute();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLoading) {
    return <PageLoader message="Verificando autenticação..." />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const target = redirect && redirect !== '/' ? redirect : '/';
      router.replace(target);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: 'url(/assets/images/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-md">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/assets/images/logo_login.png"
            alt="COMEXDEZ"
            width={260}
            height={110}
            priority
            className="w-auto"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              id="email"
              className="bg-gray-100 border border-gray-200 text-gray-700 py-1 px-3 pl-9 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 block w-full"
              placeholder="Usuário"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="password"
              id="password"
              className="bg-gray-100 border border-gray-200 text-gray-700 py-1 px-3 pl-9 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 block w-full"
              placeholder="Senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#0B3A5C] text-white font-medium py-2 px-3 rounded-md hover:bg-[#0a3351] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
            disabled={loading}
          >
            {loading ? 'ACESSANDO...' : 'ACESSAR'}
          </button>

          {error && (
            <p className="mt-4 text-center text-red-500 text-sm">{error}</p>
          )}
        </form>
        
        <div className="mt-4 text-center">
          <a href="#" className="text-[#0B3A5C] text-sm hover:underline">
            Esqueceu sua senha?
          </a>
        </div>
      </div>
    </div>
  );
}