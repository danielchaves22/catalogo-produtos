// frontend/pages/_app.tsx
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import Head from 'next/head'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { WorkingCatalogProvider } from '@/contexts/WorkingCatalogContext'
import { MessagesProvider } from '@/contexts/MessagesContext'
import { ToastProvider } from '@/components/ui/ToastContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageTransition } from '@/components/ui/PageTransition'

function getAppTitle(): string {
  const baseTitle = 'Cat\u00e1logo de Produtos';
  const ambiente = (process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();

  if (!ambiente) {
    return baseTitle + ' HML';
  }
  
  if (ambiente === 'production' || ambiente === 'prod') {
    return baseTitle + ' COMEXDEZ';
  }

  return baseTitle + ' HML';
}

function AppContent({ Component, pageProps }: AppProps) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  const appTitle = getAppTitle();

  return (
    <>
      <Head>
        <title>{appTitle}</title>
        <link rel="icon" href="/assets/images/icone_comexdez.png" />
      </Head>
      <AuthProvider>
        <WorkingCatalogProvider>
          <MessagesProvider>
            <ToastProvider>
              <PageTransition />
              <AppContent {...props} />
            </ToastProvider>
          </MessagesProvider>
        </WorkingCatalogProvider>
      </AuthProvider>
    </>
  )
}