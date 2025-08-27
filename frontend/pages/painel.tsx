// frontend/pages/painel.tsx
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import api from '@/lib/api';
import { ListaProdutosPainel } from '@/components/dashboard/ListaProdutosPainel';
import { useAuth } from '@/contexts/AuthContext';

interface ResumoDashboard {
  catalogos: {
    total: number;
  };
  produtos: {
    total: number;
    porStatus: Record<string, number>;
  };
}

export default function PainelPage() {
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function carregarResumo() {
      try {
        const response = await api.get('/dashboard/resumo');
        setResumo(response.data);
      } catch (error) {
        console.error('Erro ao carregar resumo do painel:', error);
      } finally {
        setLoading(false);
      }
    }

    carregarResumo();
  }, []);

  return (
    <DashboardLayout title="Painel">
      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <>
          <h2 className="text-2xl font-semibold text-white mb-6">
            Bem-vindo{user?.name ? `, ${user.name}` : ''}!
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card headerTitle="Produtos">
              <p className="text-4xl font-bold text-white mb-4">
                {resumo?.produtos.total ?? 0}
              </p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>PENDENTE: {resumo?.produtos.porStatus.PENDENTE ?? 0}</li>
                <li>APROVADO: {resumo?.produtos.porStatus.APROVADO ?? 0}</li>
                <li>PROCESSANDO: {resumo?.produtos.porStatus.PROCESSANDO ?? 0}</li>
                <li>TRANSMITIDO: {resumo?.produtos.porStatus.TRANSMITIDO ?? 0}</li>
                <li>ERRO: {resumo?.produtos.porStatus.ERRO ?? 0}</li>
              </ul>
            </Card>

            <Card headerTitle="Catálogos">
              <p className="text-4xl font-bold text-white">
                {resumo?.catalogos.total ?? 0}
              </p>
            </Card>
          </div>

          <section className="mt-8 bg-[#151921] p-6 rounded-lg border border-gray-700">
            <ListaProdutosPainel />
          </section>
        </>
      )}
    </DashboardLayout>
  );
}
