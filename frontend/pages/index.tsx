// frontend/pages/index.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redireciona automaticamente para o painel
    router.replace('/painel');
  }, [router]);

  return <LoadingScreen message="Redirecionando para o painel..." />;
}