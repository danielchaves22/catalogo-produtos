import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { Eye, Loader2, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AsyncJobLogResumo {
  id: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  mensagem?: string | null;
  criadoEm: string;
}

interface AsyncJobResumo {
  id: number;
  tipo: string;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  tentativas: number;
  maxTentativas: number;
  prioridade: number;
  payload: unknown;
  lockedAt: string | null;
  heartbeatAt: string | null;
  finalizadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  ultimoLog?: AsyncJobLogResumo | null;
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const instancia = new Date(data);
  if (Number.isNaN(instancia.getTime())) return '-';
  return `${instancia.toLocaleDateString('pt-BR')} ${instancia.toLocaleTimeString('pt-BR')}`;
}

function obterClasseStatus(status: AsyncJobResumo['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40';
    case 'FALHO':
    case 'CANCELADO':
      return 'bg-rose-500/10 text-rose-300 border border-rose-500/40';
    case 'PROCESSANDO':
      return 'bg-sky-500/10 text-sky-300 border border-sky-500/40';
    default:
      return 'bg-slate-500/10 text-slate-300 border border-slate-500/40';
  }
}

function traduzirStatus(status: AsyncJobResumo['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return 'Concluído';
    case 'FALHO':
      return 'Falho';
    case 'CANCELADO':
      return 'Cancelado';
    case 'PROCESSANDO':
      return 'Em processamento';
    default:
      return 'Pendente';
  }
}

export default function AjustesAtributosPage() {
  const { user, isLoading } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const [jobs, setJobs] = useState<AsyncJobResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resposta = await api.get<AsyncJobResumo[]>('/automacao/ajustes-atributos/verificacoes');
      setJobs(resposta.data);
    } catch (error) {
      console.error('Erro ao carregar verificações de atributos', error);
      addToast('Não foi possível carregar as verificações.', 'error');
    } finally {
      setCarregando(false);
    }
  }, [addToast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const iniciarVerificacao = useCallback(async () => {
    try {
      setIniciando(true);
      await api.post('/automacao/ajustes-atributos/verificacoes');
      addToast('Verificação iniciada com sucesso.', 'success');
      carregar();
    } catch (error: any) {
      const mensagem = error?.response?.data?.error || 'Não foi possível iniciar a verificação.';
      addToast(mensagem, 'error');
    } finally {
      setIniciando(false);
    }
  }, [addToast, carregar]);

  const itensOrdenados = useMemo(
    () =>
      [...jobs].sort(
        (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
      ),
    [jobs]
  );

  if (isLoading) {
    return (
      <DashboardLayout title="Ajustes de Atributos">
        <PageLoader message="Validando permissão" />
      </DashboardLayout>
    );
  }

  if (user?.role !== 'ADMIN') {
    return (
      <DashboardLayout title="Ajustes de Atributos">
        <div className="text-center text-slate-300 py-10">
          Apenas administradores podem acessar esta funcionalidade.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Ajustes de Atributos">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/processos' },
          { label: 'Ajustes de Atributos', href: '/automacao/ajustes-atributos' },
        ]}
      />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Ajustes de Atributos</h1>
          <p className="text-slate-400 text-sm mt-1">
            Inicie uma verificação diária para identificar mudanças nas estruturas de atributos por NCM.
          </p>
        </div>
        <Button disabled={iniciando} onClick={iniciarVerificacao} className="gap-2">
          {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Iniciar nova verificação
        </Button>
      </div>

      <Card>
        {carregando ? (
          <PageLoader message="Carregando verificações" />
        ) : itensOrdenados.length === 0 ? (
          <div className="text-center text-slate-400 py-10">Nenhuma verificação encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Ações</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Criado em</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Finalizado em</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Último log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {itensOrdenados.map(job => (
                  <tr key={job.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/automacao/ajustes-atributos/${job.id}`)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-slate-200 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        title="Ver detalhes da verificação"
                        aria-label="Ver detalhes da verificação"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200">#{job.id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${obterClasseStatus(job.status)}`}>
                        {traduzirStatus(job.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatarData(job.criadoEm)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatarData(job.finalizadoEm)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 truncate max-w-xs">
                      {job.ultimoLog?.mensagem || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
