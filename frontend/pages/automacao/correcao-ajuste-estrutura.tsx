import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, Loader2, Play, RotateCcw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

interface CorrecaoStatusResponse {
  jobId: number;
  status: 'PENDENTE' | 'PROCESSANDO';
  mensagem?: string;
}

export default function CorrecaoAjusteEstruturaPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { addToast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [enfileirando, setEnfileirando] = useState(false);

  const executarCorrecao = useCallback(async () => {
    try {
      setEnfileirando(true);
      const resposta = await api.post<CorrecaoStatusResponse>(
        '/produtos/ajuste-estrutura/corrigir-status',
        {}
      );

      const jobId = resposta.data.jobId;
      addToast(
        resposta.data.mensagem || `Correção enfileirada no processo #${jobId}.`,
        'success'
      );
      await router.push(`/automacao/correcao-ajuste-estrutura/${jobId}`);
    } catch (error: any) {
      const mensagem =
        error?.response?.data?.error ||
        'Não foi possível enfileirar a correção de ajuste de estrutura.';
      addToast(mensagem, 'error');
    } finally {
      setEnfileirando(false);
      setConfirmando(false);
    }
  }, [addToast, router]);

  if (isLoading) {
    return (
      <DashboardLayout title="Correção de Ajuste de Estrutura">
        <PageLoader message="Validando permissão" />
      </DashboardLayout>
    );
  }

  if (user?.role !== 'ADMIN') {
    return (
      <DashboardLayout title="Correção de Ajuste de Estrutura">
        <div className="py-10 text-center text-slate-300">
          Apenas administradores podem acessar esta funcionalidade.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Correção de Ajuste de Estrutura">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/processos' },
          {
            label: 'Correção de Ajuste de Estrutura',
            href: '/automacao/correcao-ajuste-estrutura',
          },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Correção de Ajuste de Estrutura
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Reavalia produtos em AJUSTAR_ESTRUTURA e mantém esse status apenas nos itens impactados.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => router.push('/automacao/processos')}
        >
          <RotateCcw className="h-4 w-4" />
          Processos
        </Button>
      </div>

      <Card className="max-w-3xl p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-100">
              Corrigir produtos marcados como AJUSTAR_ESTRUTURA
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A rotina percorre os produtos atualmente marcados para ajuste e restaura o status dos que não
              foram afetados pela última mudança de estrutura da NCM.
            </p>
            <div className="mt-5">
              <Button
                type="button"
                variant="accent"
                size="md"
                className="flex items-center gap-2"
                onClick={() => setConfirmando(true)}
                disabled={enfileirando}
              >
                {enfileirando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Executar correção
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921] p-6">
            <h3 className="mb-3 text-xl font-semibold text-white">Executar correção</h3>
            <p className="mb-6 text-sm leading-6 text-gray-300">
              A rotina será enfileirada e executada em segundo plano. O andamento ficará disponível em
              Processos Assíncronos.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmando(false)}
                disabled={enfileirando}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="accent"
                onClick={executarCorrecao}
                disabled={enfileirando}
                className="flex items-center gap-2"
              >
                {enfileirando && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
