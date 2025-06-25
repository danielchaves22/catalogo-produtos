import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import ProdutoForm from '@/components/produtos/ProdutoForm';

export default function NovoProdutoPage() {
  return (
    <DashboardLayout title="Novo Produto">
      <Card>
        <ProdutoForm />
      </Card>
    </DashboardLayout>
  );
}
