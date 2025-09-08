// frontend/pages/_app.tsx
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import Head from 'next/head'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { WorkingCatalogProvider } from '@/contexts/WorkingCatalogContext'
import { ToastProvider } from '@/components/ui/ToastContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageTransition } from '@/components/ui/PageTransition'

function AppContent({ Component, pageProps }: AppProps) {
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  return (
    <>
      <Head>
        <title>Catálogo de Produtos</title>
        <link rel="icon" href="/assets/images/icone_comexdez.png" />
      </Head>
      <AuthProvider>
        <WorkingCatalogProvider>
          <ToastProvider>
            <PageTransition />
            <AppContent {...props} />
          </ToastProvider>
        </WorkingCatalogProvider>
      </AuthProvider>
    </>
  )
}