// frontend/pages/placeholder.tsx
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { useRouter } from 'next/router';

export default function PlaceholderPage() {
  const router = useRouter();
  const path = router.pathname.substring(1); // Remove a barra inicial
  const title = path.charAt(0).toUpperCase() + path.slice(1); // Capitaliza a primeira letra
  
  return (
    <DashboardLayout title={title}>
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-medium mb-4">Página em Desenvolvimento</h2>
        <p className="text-gray-600 mb-6">
          Esta página ({title}) está em desenvolvimento e será implementada em breve.
        </p>
        <div className="w-24 h-24 border-t-4 border-l-4 border-primary rounded-full animate-spin mx-auto mb-6"></div>
        <p className="text-sm text-gray-500">
          Funcionalidade completa estará disponível na próxima atualização.
        </p>
      </Card>
    </DashboardLayout>
  );
}
