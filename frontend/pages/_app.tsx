// frontend/pages/_app.tsx
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/ToastContext'

function AuthGuard({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth()
  const router = useRouter()
  const publicPaths = ['/login']
  const path = router.pathname

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Se ainda estiver carregando o token, aguarde
    if (isLoading) return;

    // Rota pública? libera sem verificar token
    if (publicPaths.includes(path)) {
      setLoading(false)
      return
    }

    // Rota protegida e sem token? redireciona para /login
    if (!token) {
      router.replace({
        pathname: '/login',
        query: { redirect: path },
      })
      return
    }

    // Rota protegida e token presente? libera
    setLoading(false)
  }, [token, path, router, isLoading])

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return <>{children}</>
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGuard>
          <Component {...pageProps} />
        </AuthGuard>
      </ToastProvider>
    </AuthProvider>
  )
}