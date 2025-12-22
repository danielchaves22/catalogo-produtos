import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, ExternalLink } from 'lucide-react';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

interface AsyncJobLog {
  id: number;
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  mensagem?: string | null;
  criadoEm: string;
}

interface AsyncJobDetalhe {
  id: number;
  tipo: 'APLICACAO_AJUSTE_ESTRUTURA';
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHO' | 'CANCELADO';
  tentativas: number;
  maxTentativas: number;
  prioridade: number;
  payload: {
    verificacaoJobId?: number;
    combinacoes?: Array<{ ncm: string; modalidade: string }>;
  } | null;
  lockedAt: string | null;
  heartbeatAt: string | null;
  finalizadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  logs: AsyncJobLog[];
}

function formatarData(data?: string | null) {
  if (!data) return '-';
  const instancia = new Date(data);
  if (Number.isNaN(instancia.getTime())) return '-';
  return `${instancia.toLocaleDateString('pt-BR')} ${instancia.toLocaleTimeString('pt-BR')}`;
}

function obterBadge(status: AsyncJobDetalhe['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return { cor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40', texto: 'Concluído', icone: <CheckCircle2 className="h-4 w-4" /> };
    case 'FALHO':
    case 'CANCELADO':
      return { cor: 'text-rose-300 bg-rose-500/10 border-rose-500/40', texto: 'Falho', icone: <AlertTriangle className="h-4 w-4" /> };
    case 'PROCESSANDO':
      return { cor: 'text-sky-300 bg-sky-500/10 border-sky-500/40', texto: 'Em processamento', icone: <Clock3 className="h-4 w-4" /> };
    default:
      return { cor: 'text-slate-300 bg-slate-500/10 border-slate-500/40', texto: 'Pendente', icone: <CircleDashed className="h-4 w-4" /> };
  }
}

export default function AplicacaoAjusteAtributosDetalhePage() {
  useProtectedRoute();
  const router = useRouter();
  const { addToast } = useToast();
  const [dados, setDados] = useState<AsyncJobDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!router.query.id) return;

    const carregar = async () => {
      try {
        const resposta = await api.get<AsyncJobDetalhe>(`/automacao/jobs/${router.query.id}`);
        setDados(resposta.data);
      } catch (error) {
        console.error('Erro ao carregar detalhes da aplicação de ajustes', error);
        addToast('Não foi possível carregar os detalhes da aplicação de ajustes.', 'error');
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, [addToast, router.query.id]);

  const combinacoes = useMemo(
    () => dados?.payload?.combinacoes ?? [],
    [dados?.payload?.combinacoes]
  );

  if (carregando) {
    return (
      <DashboardLayout title="Aplicação de Ajustes">
        <PageLoader message="Carregando detalhes da aplicação..." />
      </DashboardLayout>
    );
  }

  if (!dados) {
    return (
      <DashboardLayout title="Aplicação de Ajustes">
        <div className="text-center text-slate-300 py-10">
          Não foi possível localizar o processo solicitado.
        </div>
      </DashboardLayout>
    );
  }

  const badge = obterBadge(dados.status);

  return (
    <DashboardLayout title="Aplicação de Ajustes">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Automação', href: '/automacao/processos' },
          { label: 'Aplicação de Ajustes', href: `/automacao/ajustes-atributos/aplicacoes/${dados.id}` },
        ]}
      />

      <div className="mb-6">
        <p className="text-slate-400 text-sm mb-1">Processo #{dados.id}</p>
        <h1 className="text-2xl font-semibold text-slate-100">Aplicação de ajustes de estrutura</h1>
        <p className="text-slate-400 text-sm mt-1">
          Acompanhe o progresso da aplicação das estruturas sincronizadas e dos produtos marcados.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Status</p>
          <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm ${badge.cor}`}>
            {badge.icone}
            {badge.texto}
          </div>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Execução</p>
          <p className="text-slate-100 font-semibold mt-1">Iniciado: {formatarData(dados.criadoEm)}</p>
          <p className="text-slate-400 text-sm">Atualizado: {formatarData(dados.atualizadoEm)}</p>
          <p className="text-slate-400 text-sm">Finalizado: {formatarData(dados.finalizadoEm)}</p>
        </Card>
        <Card className="p-4 border border-slate-800">
          <p className="text-slate-400 text-sm">Tentativas</p>
          <p className="text-slate-100 font-semibold mt-1">
            {dados.tentativas} / {dados.maxTentativas}
          </p>
          <p className="text-slate-400 text-sm">Prioridade: {dados.prioridade}</p>
        </Card>
      </div>

      <Card className="p-4 border border-slate-800 mb-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-slate-200 text-sm">
            <span className="text-slate-400">Verificação vinculada:</span>
            {dados.payload?.verificacaoJobId ? (
              <Link
                href={`/automacao/ajustes-atributos/${dados.payload.verificacaoJobId}`}
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
              >
                #{dados.payload.verificacaoJobId} <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <span className="text-slate-300">Não informada</span>
            )}
          </div>
          {combinacoes.length > 0 ? (
            <div>
              <p className="text-slate-400 text-sm mb-2">NCMs selecionadas para aplicação</p>
              <div className="flex flex-wrap gap-2">
                {combinacoes.map((combo, index) => (
                  <span
                    key={`${combo.ncm}-${combo.modalidade}-${index}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
                  >
                    NCM {combo.ncm} · {combo.modalidade}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Aplicação executada para todas as NCMs divergentes.</p>
          )}
        </div>
      </Card>

      <Card className="p-4 border border-slate-800">
        <p className="text-slate-200 font-semibold mb-3">Linha do tempo</p>
        {dados.logs.length === 0 ? (
          <p className="text-slate-400 text-sm">Nenhum log registrado até o momento.</p>
        ) : (
          <div className="space-y-3">
            {dados.logs.map(log => (
              <div key={log.id} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
                <p className="text-slate-200 text-sm font-medium">{log.mensagem || 'Atualização registrada.'}</p>
                <p className="text-slate-400 text-xs mt-1">{formatarData(log.criadoEm)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
