// frontend/pages/index.tsx
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { PageLoader } from '@/components/ui/PageLoader';

export default function HomePage() {
  const { user } = useAuth();
  const { isLoading } = useProtectedRoute();
  
  if (isLoading) {
    return <PageLoader message="Carregando dashboard..." />;
  }

  return (
    <DashboardLayout title="Bem-vindo ao Sistema">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Informações do Usuário</h2>
          {user ? (
            <div className="text-left">
              <p><strong>Nome:</strong> {user.name}</p>
              <p><strong>Email:</strong> {user.email}</p>
            </div>
          ) : (
            <p>Carregando informações do usuário...</p>
          )}
        </Card>
        
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Acesso Rápido</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-medium text-lg mb-2">Produtos</h3>
              <p className="text-gray-600">Acesse o catálogo de produtos</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-medium text-lg mb-2">Relatórios</h3>
              <p className="text-gray-600">Visualize relatórios e estatísticas</p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}