// frontend/pages/perfil.tsx
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function PerfilPage() {
  const { user } = useAuth();

  return (
    <DashboardLayout title="Meu Perfil">
      <div className="max-w-3xl mx-auto">
        <Card
          className="mb-6"
          headerTitle="Informações do Perfil"
          headerSubtitle="Dados de acesso gerenciados por outra aplicação"
        >
          <div>
            <Input
              label="Nome Completo"
              value={user?.name || ''}
              disabled
              className="mb-4"
            />

            <Input
              label="Email"
              type="email"
              value={user?.email || ''}
              disabled
              className="mb-4"
            />
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}